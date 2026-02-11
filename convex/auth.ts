import { convexAuth } from "@convex-dev/auth/server";
import GitHub from "@auth/core/providers/github";
import { Password } from "@convex-dev/auth/providers/Password";
import { ResendOTP } from "./otp/ResendOTP";

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [
    ResendOTP,
    Password,
    GitHub({
      authorization: {
        params: { scope: "user:email" },
      },
    }),
  ],
});
