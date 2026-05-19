/* eslint-disable react-refresh/only-export-components */
import { render } from "@react-email/render";
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Img,
  Preview,
  Text,
} from "@react-email/components";
import { sendEmail } from "@cvx/email";
import { SITE_URL } from "@cvx/env";

type SubscriptionEmailOptions = {
  email: string;
  subscriptionId: string;
};

/**
 * Templates.
 */
export function SubscriptionSuccessEmail({ email }: SubscriptionEmailOptions) {
  return (
    <Html>
      <Head />
      <Preview>Subskrypcja PRO aktywowana</Preview>
      <Body
        style={{
          backgroundColor: "#ffffff",
          fontFamily:
            '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
        }}
      >
        <Container style={{ margin: "0 auto", padding: "20px 0 48px" }}>
          <Img
            src={`${SITE_URL}/images/convex-logo-email.jpg`}
            width="40"
            height="37"
            alt=""
          />
          <Text style={{ fontSize: "16px", lineHeight: "26px" }}>
            Cześć {email}!
          </Text>
          <Text style={{ fontSize: "16px", lineHeight: "26px" }}>
            Twoja subskrypcja PRO została pomyślnie aktywowana.
            <br />
            Życzymy udanego korzystania z nowych funkcji!
          </Text>
          <Text style={{ fontSize: "16px", lineHeight: "26px" }}>
            Zespół <Link href={process.env.SITE_URL ?? "https://app.example.com"}>Unify</Link>.
          </Text>
          <Hr style={{ borderColor: "#cccccc", margin: "20px 0" }} />
          <Text style={{ color: "#8898aa", fontSize: "12px" }}>
            200 domain-name.com
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export function SubscriptionErrorEmail({ email }: SubscriptionEmailOptions) {
  return (
    <Html>
      <Head />
      <Preview>Problem z subskrypcją — wsparcie klienta</Preview>
      <Body
        style={{
          backgroundColor: "#ffffff",
          fontFamily:
            '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
        }}
      >
        <Container style={{ margin: "0 auto", padding: "20px 0 48px" }}>
          <Img
            src="https://react-email-demo-ijnnx5hul-resend.vercel.app/static/vercel-logo.png"
            width="40"
            height="37"
            alt=""
          />
          <Text style={{ fontSize: "16px", lineHeight: "26px" }}>
            Cześć {email}.
          </Text>
          <Text style={{ fontSize: "16px", lineHeight: "26px" }}>
            Nie udało nam się przetworzyć Twojej subskrypcji planu PRO.
            <br />
            Nie martw się — nie pobierzemy od Ciebie żadnej opłaty.
          </Text>
          <Text style={{ fontSize: "16px", lineHeight: "26px" }}>
            Zespół <Link href={process.env.SITE_URL ?? "https://app.example.com"}>Unify</Link>.
          </Text>
          <Hr style={{ borderColor: "#cccccc", margin: "20px 0" }} />
          <Text style={{ color: "#8898aa", fontSize: "12px" }}>
            200 domain-name.com
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

/**
 * Renders.
 */
export function renderSubscriptionSuccessEmail(args: SubscriptionEmailOptions) {
  return render(<SubscriptionSuccessEmail {...args} />);
}

export function renderSubscriptionErrorEmail(args: SubscriptionEmailOptions) {
  return render(<SubscriptionErrorEmail {...args} />);
}

/**
 * Senders.
 */
export async function sendSubscriptionSuccessEmail({
  email,
  subscriptionId,
}: SubscriptionEmailOptions) {
  const html = renderSubscriptionSuccessEmail({ email, subscriptionId });

  await sendEmail({
    to: email,
    subject: "Subskrypcja PRO została aktywowana",
    html,
  });
}

export async function sendSubscriptionErrorEmail({
  email,
  subscriptionId,
}: SubscriptionEmailOptions) {
  const html = renderSubscriptionErrorEmail({ email, subscriptionId });

  await sendEmail({
    to: email,
    subject: "Problem z subskrypcją — wsparcie klienta",
    html,
  });
}
