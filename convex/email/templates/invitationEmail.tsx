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
  // Optional platform-level overrides. If unset, sendEmail falls back to the
  // AUTH_EMAIL env var.
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
};

const ROLE_LABELS_PL: Record<string, string> = {
  owner: "właściciela",
  admin: "administratora",
  member: "członka zespołu",
  viewer: "obserwatora",
};

function translateRole(role: string): string {
  return ROLE_LABELS_PL[role] ?? role;
}

export function buildInvitationSubject(orgName: string) {
  return `Zaproszenie do ${orgName}`;
}

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
  const roleLabel = translateRole(role);
  return (
    <Html>
      <Head />
      <Preview>Zaproszenie do {orgName}</Preview>
      <Body
        style={{
          backgroundColor: "#ffffff",
          fontFamily:
            '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
        }}
      >
        <Container style={{ margin: "0 auto", padding: "20px 0 48px" }}>
          <Text style={{ fontSize: "16px", lineHeight: "26px" }}>
            Cześć {email}!
          </Text>
          <Text style={{ fontSize: "16px", lineHeight: "26px" }}>
            {inviterName} zaprasza Cię do dołączenia do organizacji{" "}
            <strong>{orgName}</strong> w roli {roleLabel}.
          </Text>
          <Text style={{ fontSize: "16px", lineHeight: "26px" }}>
            Kliknij przycisk poniżej, aby zaakceptować zaproszenie.
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
            Zaakceptuj zaproszenie
          </Button>
          <Text style={{ fontSize: "16px", lineHeight: "26px" }}>
            Jeśli nie spodziewałeś się tego zaproszenia, możesz zignorować tę
            wiadomość.
          </Text>
          <Hr style={{ borderColor: "#cccccc", margin: "20px 0" }} />
          <Text style={{ color: "#8898aa", fontSize: "12px" }}>
            To zaproszenie zostało wysłane na adres {email}.
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
  fromName,
  fromEmail,
  replyTo,
}: InvitationEmailOptions) {
  const html = renderInvitationEmail({
    email,
    orgName,
    inviterName,
    role,
    token,
  });

  // Build the From header only if BOTH name+email are provided; partial
  // overrides fall back to AUTH_EMAIL to keep the address valid.
  const from =
    fromName && fromEmail ? `${fromName} <${fromEmail}>` : fromEmail || undefined;

  await sendEmail({
    to: email,
    subject: buildInvitationSubject(orgName),
    html,
    ...(from ? { from } : {}),
    ...(replyTo ? { replyTo } : {}),
  });
}
