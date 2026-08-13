#!/usr/bin/env python3

import argparse
import hashlib
import json
import sys

import boto3
from botocore.exceptions import ClientError


def session(args):
    return boto3.Session(profile_name=args.profile, region_name=args.region)


def stack_outputs(client, stack_name):
    stack = client.describe_stacks(StackName=stack_name)["Stacks"][0]
    return {
        output["OutputKey"]: output["OutputValue"]
        for output in stack.get("Outputs", [])
    }


def put_object(client, args):
    with open(args.file, "rb") as source:
        local_bytes = source.read()
    parameters = {
        "Bucket": args.bucket,
        "Key": args.key,
        "Body": local_bytes,
        "ContentType": args.content_type,
        "CacheControl": args.cache_control,
    }
    if args.if_none_match:
        parameters["IfNoneMatch"] = args.if_none_match
    if args.if_match:
        parameters["IfMatch"] = args.if_match
    try:
        response = client.put_object(**parameters)
        print(json.dumps({"ETag": response.get("ETag"), "reused": False}))
    except ClientError as error:
        status = error.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        if status != 412 or not args.reuse_identical:
            raise
        existing = client.get_object(Bucket=args.bucket, Key=args.key)
        existing_bytes = existing["Body"].read()
        if hashlib.sha256(existing_bytes).digest() != hashlib.sha256(local_bytes).digest():
            raise RuntimeError(
                "Immutable object already exists with different contents: "
                + args.key
            ) from error
        print(json.dumps({"ETag": existing.get("ETag"), "reused": True}))


def deploy_stack(cloudformation, s3, args):
    with open(args.code_file, "rb") as body:
        try:
            s3.put_object(
                Bucket=args.code_bucket,
                Key=args.code_key,
                Body=body,
                IfNoneMatch="*",
            )
        except ClientError as error:
            if error.response.get("ResponseMetadata", {}).get("HTTPStatusCode") != 412:
                raise

    with open(args.template_file, "r", encoding="utf-8") as template:
        template_body = template.read()
    cloudformation.validate_template(TemplateBody=template_body)
    parameters = [
        {"ParameterKey": "LambdaCodeBucket", "ParameterValue": args.code_bucket},
        {"ParameterKey": "LambdaCodeKey", "ParameterValue": args.code_key},
    ]
    common = {
        "StackName": args.stack_name,
        "TemplateBody": template_body,
        "Parameters": parameters,
        "Capabilities": ["CAPABILITY_IAM"],
    }
    try:
        cloudformation.describe_stacks(StackName=args.stack_name)
        try:
            cloudformation.update_stack(**common)
            cloudformation.get_waiter("stack_update_complete").wait(
                StackName=args.stack_name
            )
        except ClientError as error:
            if "No updates are to be performed" not in str(error):
                raise
    except ClientError as error:
        if "does not exist" not in str(error):
            raise
        cloudformation.create_stack(**common)
        cloudformation.get_waiter("stack_create_complete").wait(
            StackName=args.stack_name
        )
    print(json.dumps(stack_outputs(cloudformation, args.stack_name)))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", required=True)
    parser.add_argument("--region", required=True)
    commands = parser.add_subparsers(dest="command", required=True)

    outputs = commands.add_parser("stack-outputs")
    outputs.add_argument("--stack-name", required=True)

    put = commands.add_parser("put-object")
    put.add_argument("--bucket", required=True)
    put.add_argument("--key", required=True)
    put.add_argument("--file", required=True)
    put.add_argument("--content-type", required=True)
    put.add_argument("--cache-control", required=True)
    put.add_argument("--if-none-match")
    put.add_argument("--if-match")
    put.add_argument("--reuse-identical", action="store_true")

    get = commands.add_parser("get-object")
    get.add_argument("--bucket", required=True)
    get.add_argument("--key", required=True)
    get.add_argument("--file", required=True)

    deploy = commands.add_parser("deploy-stack")
    deploy.add_argument("--stack-name", required=True)
    deploy.add_argument("--template-file", required=True)
    deploy.add_argument("--code-bucket", required=True)
    deploy.add_argument("--code-key", required=True)
    deploy.add_argument("--code-file", required=True)

    args = parser.parse_args()
    aws = session(args)
    if args.command == "stack-outputs":
        print(
            json.dumps(
                stack_outputs(aws.client("cloudformation"), args.stack_name)
            )
        )
    elif args.command == "put-object":
        put_object(aws.client("s3"), args)
    elif args.command == "get-object":
        try:
            response = aws.client("s3").get_object(
                Bucket=args.bucket, Key=args.key
            )
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") in (
                "NoSuchKey",
                "404",
            ):
                sys.exit(3)
            raise
        with open(args.file, "wb") as output:
            output.write(response["Body"].read())
        print(json.dumps({"ETag": response.get("ETag")}))
    elif args.command == "deploy-stack":
        deploy_stack(
            aws.client("cloudformation"),
            aws.client("s3"),
            args,
        )


if __name__ == "__main__":
    main()
