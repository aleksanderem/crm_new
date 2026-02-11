/* eslint-disable react-refresh/only-export-components */
import { render } from "@react-email/render";
import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Text,
} from "@react-email/components";
import { sendEmail } from "@cvx/email";
import { SITE_URL } from "@cvx/env";

type InvitationEmailOptions = {
  email: string;
  orgName: string;
  inviterName: string;
  role: string;
  token: string;
};

/**
 * Templates.
 */
export function InvitationEmail({
  email,
  orgName,
  inviterName,
  role,
  token,
}: InvitationEmailOptions) {
  return (
    <Html>
      <Head />
      <Preview>You've been invited to join {orgName}</Preview>
      <Body
        style={{
          backgroundColor: "#ffffff",
          fontFamily:
            '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
        }}
      >
        <Container style={{ margin: "0 auto", padding: "20px 0 48px" }}>
          <Text style={{ fontSize: "16px", lineHeight: "26px" }}>
            Hello {email}!
          </Text>
          <Text style={{ fontSize: "16px", lineHeight: "26px" }}>
            You've been invited to join <strong>{orgName}</strong> as a {role}{" "}
            by {inviterName}.
          </Text>
          <Text style={{ fontSize: "16px", lineHeight: "26px" }}>
            Click the button below to accept the invitation.
          </Text>
          <Button
            href={`${SITE_URL}/invite/${token}`}
            style={{
              backgroundColor: "#2563eb",
              color: "#ffffff",
              padding: "12px 24px",
              borderRadius: "6px",
              textDecoration: "none",
              display: "inline-block",
              fontWeight: 600,
              fontSize: "14px",
            }}
          >
            Accept Invitation
          </Button>
          <Text style={{ fontSize: "16px", lineHeight: "26px" }}>
            If you didn't expect this invitation, you can safely ignore this
            email.
          </Text>
          <Hr style={{ borderColor: "#cccccc", margin: "20px 0" }} />
          <Text style={{ color: "#8898aa", fontSize: "12px" }}>
            This invitation was sent to {email}.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

/**
 * Renders.
 */
export function renderInvitationEmail(args: InvitationEmailOptions) {
  return render(<InvitationEmail {...args} />);
}

/**
 * Senders.
 */
export async function sendInvitationEmail({
  email,
  orgName,
  inviterName,
  role,
  token,
}: InvitationEmailOptions) {
  const html = renderInvitationEmail({
    email,
    orgName,
    inviterName,
    role,
    token,
  });

  await sendEmail({
    to: email,
    subject: `You've been invited to join ${orgName}`,
    html,
  });
}
