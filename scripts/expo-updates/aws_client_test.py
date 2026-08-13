import contextlib
import importlib.util
import io
import json
import os
import tempfile
import unittest
from types import SimpleNamespace

from botocore.exceptions import ClientError


MODULE_PATH = os.path.join(os.path.dirname(__file__), "aws-client.py")
SPEC = importlib.util.spec_from_file_location("expo_updates_aws_client", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FakeS3:
    def __init__(self, existing=None, fail_create=False):
        self.existing = existing
        self.fail_create = fail_create
        self.put_parameters = None

    def put_object(self, **parameters):
        self.put_parameters = parameters
        if self.fail_create:
            raise ClientError(
                {
                    "Error": {"Code": "PreconditionFailed"},
                    "ResponseMetadata": {"HTTPStatusCode": 412},
                },
                "PutObject",
            )
        return {"ETag": '"new"'}

    def get_object(self, **_parameters):
        return {
            "ETag": '"existing"',
            "Body": io.BytesIO(self.existing),
        }


def args(file_path, reuse_identical):
    return SimpleNamespace(
        file=file_path,
        bucket="bucket",
        key="assets/hash",
        content_type="application/octet-stream",
        cache_control="immutable",
        if_none_match="*",
        if_match=None,
        reuse_identical=reuse_identical,
    )


class ImmutablePutTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.NamedTemporaryFile(delete=False)
        self.temporary.write(b"expected bytes")
        self.temporary.close()

    def tearDown(self):
        os.unlink(self.temporary.name)

    def test_create_only_headers_are_sent(self):
        client = FakeS3()
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            MODULE.put_object(client, args(self.temporary.name, True))
        self.assertEqual(client.put_parameters["IfNoneMatch"], "*")
        self.assertFalse(json.loads(output.getvalue())["reused"])

    def test_identical_existing_object_is_verified_and_reused(self):
        client = FakeS3(existing=b"expected bytes", fail_create=True)
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            MODULE.put_object(client, args(self.temporary.name, True))
        self.assertTrue(json.loads(output.getvalue())["reused"])

    def test_different_existing_object_remains_fatal(self):
        client = FakeS3(existing=b"different bytes", fail_create=True)
        with self.assertRaises(RuntimeError):
            MODULE.put_object(client, args(self.temporary.name, True))

    def test_precondition_failure_is_not_reused_without_explicit_flag(self):
        client = FakeS3(existing=b"expected bytes", fail_create=True)
        with self.assertRaises(ClientError):
            MODULE.put_object(client, args(self.temporary.name, False))


if __name__ == "__main__":
    unittest.main()
