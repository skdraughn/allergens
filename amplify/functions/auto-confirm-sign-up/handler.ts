type PreSignUpEvent = {
  response: {
    autoConfirmUser?: boolean;
    autoVerifyEmail?: boolean;
    autoVerifyPhone?: boolean;
  };
  request: {
    userAttributes?: Record<string, string | undefined>;
  };
};

export const handler = async (event: PreSignUpEvent) => {
  event.response.autoConfirmUser = true;

  if (event.request.userAttributes?.email) {
    event.response.autoVerifyEmail = true;
  }

  return event;
};
