import {
  Container,
  Head,
  Heading,
  Html,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

export function VerificationCodeEmail({
  code,
  expires,
}: {
  code: string;
  expires: Date;
}) {
  return (
    <Html>
      <Tailwind>
        <Head />
        <Container className="container px-20 font-sans">
          <Heading className="text-xl font-bold mb-4">
            Zaloguj się do CRM Kolabo
          </Heading>
          <Text className="text-sm">
            Wprowadź poniższy kod na stronie logowania.
          </Text>
          <Section className="text-center">
            <Text className="font-semibold">Kod weryfikacyjny</Text>
            <Text className="font-bold text-4xl">{code}</Text>
            <Text>
              (Kod jest ważny przez{" "}
              {Math.floor((+expires - Date.now()) / (60 * 60 * 1000))} godz.)
            </Text>
          </Section>
        </Container>
      </Tailwind>
    </Html>
  );
}
