import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

interface SystemTemplateDef {
  slug: string;
  category: string;
  module: string;
  eventType?: string;
  requiredSources: string[];
  pl: { name: string; subject: string; body: string };
  en: { name: string; subject: string; body: string };
}

// ---------------------------------------------------------------------------
// Platform / Auth (5)
// ---------------------------------------------------------------------------

const PLATFORM_TEMPLATES: SystemTemplateDef[] = [
  {
    slug: "email_verification",
    category: "auth",
    module: "platform",
    eventType: "email_verification",
    requiredSources: ["current_user", "org"],
    pl: {
      name: "Weryfikacja adresu e-mail",
      subject: "Potwierdź swój adres e-mail — {{org.name}}",
      body: `<p>Cześć {{current_user.name}},</p>
<p>Dziękujemy za rejestrację w <strong>{{org.name}}</strong>. Aby aktywować konto, kliknij poniższy link:</p>
<p><a href="{{current_user.verification_url}}">Potwierdź adres e-mail</a></p>
<p>Link jest ważny przez 24 godziny. Jeśli nie zakładałeś konta, zignoruj tę wiadomość.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Email Verification",
      subject: "Verify your email address — {{org.name}}",
      body: `<p>Hi {{current_user.name}},</p>
<p>Thank you for signing up for <strong>{{org.name}}</strong>. Click the link below to activate your account:</p>
<p><a href="{{current_user.verification_url}}">Verify email address</a></p>
<p>This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "password_reset",
    category: "auth",
    module: "platform",
    eventType: "password_reset",
    requiredSources: ["current_user", "org"],
    pl: {
      name: "Reset hasła",
      subject: "Resetowanie hasła — {{org.name}}",
      body: `<p>Cześć {{current_user.name}},</p>
<p>Otrzymaliśmy prośbę o zresetowanie hasła do Twojego konta w <strong>{{org.name}}</strong>.</p>
<p><a href="{{current_user.reset_url}}">Zresetuj hasło</a></p>
<p>Link jest ważny przez 1 godzinę. Jeśli to nie Ty wysłałeś tę prośbę, zignoruj wiadomość — Twoje hasło pozostanie bez zmian.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Password Reset",
      subject: "Reset your password — {{org.name}}",
      body: `<p>Hi {{current_user.name}},</p>
<p>We received a request to reset the password for your account at <strong>{{org.name}}</strong>.</p>
<p><a href="{{current_user.reset_url}}">Reset your password</a></p>
<p>This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email — your password will remain unchanged.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "team_invitation",
    category: "auth",
    module: "platform",
    eventType: "team_invitation",
    requiredSources: ["current_user", "org"],
    pl: {
      name: "Zaproszenie do zespołu",
      subject: "{{current_user.name}} zaprasza Cię do {{org.name}}",
      body: `<p>Cześć,</p>
<p><strong>{{current_user.name}}</strong> zaprasza Cię do dołączenia do zespołu <strong>{{org.name}}</strong> na platformie CRM.</p>
<p>Kliknij poniższy link, aby zaakceptować zaproszenie i skonfigurować swoje konto:</p>
<p><a href="{{current_user.invitation_url}}">Akceptuj zaproszenie</a></p>
<p>Zaproszenie wygasa po 7 dniach. Jeśli masz pytania, skontaktuj się z {{current_user.name}} pod adresem {{current_user.email}}.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Team Invitation",
      subject: "{{current_user.name}} has invited you to join {{org.name}}",
      body: `<p>Hi,</p>
<p><strong>{{current_user.name}}</strong> has invited you to join the <strong>{{org.name}}</strong> team on the CRM platform.</p>
<p>Click the link below to accept the invitation and set up your account:</p>
<p><a href="{{current_user.invitation_url}}">Accept invitation</a></p>
<p>The invitation expires in 7 days. If you have any questions, contact {{current_user.name}} at {{current_user.email}}.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "welcome",
    category: "auth",
    module: "platform",
    eventType: "welcome",
    requiredSources: ["current_user", "org"],
    pl: {
      name: "Powitanie nowego użytkownika",
      subject: "Witaj w {{org.name}}! 🎉",
      body: `<p>Cześć {{current_user.name}},</p>
<p>Witamy na pokładzie <strong>{{org.name}}</strong>! Twoje konto jest gotowe.</p>
<p>Oto kilka rzeczy, od których możesz zacząć:</p>
<ul>
  <li>Uzupełnij swój profil i dodaj zdjęcie</li>
  <li>Sprawdź panel główny i zapoznaj się z dostępnymi modułami</li>
  <li>Zaproś pozostałych członków zespołu</li>
</ul>
<p>Jeśli masz pytania, odpiszemy na każdą wiadomość.</p>
<p>Do zobaczenia w systemie!</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Welcome New User",
      subject: "Welcome to {{org.name}}! 🎉",
      body: `<p>Hi {{current_user.name}},</p>
<p>Welcome aboard at <strong>{{org.name}}</strong>! Your account is ready to go.</p>
<p>Here are a few things to get you started:</p>
<ul>
  <li>Complete your profile and add a photo</li>
  <li>Explore the main dashboard and discover available modules</li>
  <li>Invite the rest of your team members</li>
</ul>
<p>If you have any questions, we'll reply to every message.</p>
<p>See you inside!</p>
<p>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "account_deactivation",
    category: "auth",
    module: "platform",
    eventType: "account_deactivation",
    requiredSources: ["current_user", "org"],
    pl: {
      name: "Dezaktywacja konta",
      subject: "Twoje konto w {{org.name}} zostało dezaktywowane",
      body: `<p>Cześć {{current_user.name}},</p>
<p>Informujemy, że Twoje konto w organizacji <strong>{{org.name}}</strong> zostało dezaktywowane.</p>
<p>Jeśli uważasz, że to pomyłka lub chcesz ponownie aktywować dostęp, skontaktuj się z administratorem organizacji lub napisz do nas bezpośrednio.</p>
<p>Dane Twojego konta zostaną przechowane zgodnie z naszą polityką prywatności.</p>
<p>Dziękujemy za korzystanie z naszej platformy.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Account Deactivation",
      subject: "Your {{org.name}} account has been deactivated",
      body: `<p>Hi {{current_user.name}},</p>
<p>We're writing to inform you that your account in the <strong>{{org.name}}</strong> organization has been deactivated.</p>
<p>If you believe this is a mistake or would like to regain access, please contact your organization's administrator or reach out to us directly.</p>
<p>Your account data will be retained in accordance with our privacy policy.</p>
<p>Thank you for using our platform.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
];

// ---------------------------------------------------------------------------
// CRM / Sales (10)
// ---------------------------------------------------------------------------

const CRM_SALES_TEMPLATES: SystemTemplateDef[] = [
  {
    slug: "lead_new_assigned",
    category: "sales",
    module: "crm",
    eventType: "lead_new_assigned",
    requiredSources: ["lead", "contact", "current_user", "org"],
    pl: {
      name: "Nowy lead przypisany",
      subject: "Nowy lead: {{lead.name}} — przypisany do Ciebie",
      body: `<p>Cześć {{current_user.name}},</p>
<p>Właśnie przypisano Ci nowego leada do obsługi:</p>
<table>
  <tr><td><strong>Lead:</strong></td><td>{{lead.name}}</td></tr>
  <tr><td><strong>Kontakt:</strong></td><td>{{contact.name}}</td></tr>
  <tr><td><strong>E-mail:</strong></td><td>{{contact.email}}</td></tr>
  <tr><td><strong>Telefon:</strong></td><td>{{contact.phone}}</td></tr>
  <tr><td><strong>Status:</strong></td><td>{{lead.status}}</td></tr>
</table>
<p>Zaloguj się do systemu, aby zobaczyć szczegóły i podjąć pierwsze kroki.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "New Lead Assigned",
      subject: "New lead: {{lead.name}} — assigned to you",
      body: `<p>Hi {{current_user.name}},</p>
<p>A new lead has just been assigned to you:</p>
<table>
  <tr><td><strong>Lead:</strong></td><td>{{lead.name}}</td></tr>
  <tr><td><strong>Contact:</strong></td><td>{{contact.name}}</td></tr>
  <tr><td><strong>Email:</strong></td><td>{{contact.email}}</td></tr>
  <tr><td><strong>Phone:</strong></td><td>{{contact.phone}}</td></tr>
  <tr><td><strong>Status:</strong></td><td>{{lead.status}}</td></tr>
</table>
<p>Log in to the system to view the details and take next steps.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "lead_status_changed",
    category: "sales",
    module: "crm",
    eventType: "lead_status_changed",
    requiredSources: ["lead", "contact", "current_user", "org"],
    pl: {
      name: "Zmiana statusu leada",
      subject: "Status leada {{lead.name}} zmienił się",
      body: `<p>Cześć {{current_user.name}},</p>
<p>Status leada <strong>{{lead.name}}</strong> (kontakt: {{contact.name}}) został zaktualizowany.</p>
<p>Aktualny status: <strong>{{lead.status}}</strong></p>
<p>Zaloguj się do systemu CRM, aby zobaczyć pełną historię zmian i zaplanować kolejne działania.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Lead Status Changed",
      subject: "Lead {{lead.name}} status has changed",
      body: `<p>Hi {{current_user.name}},</p>
<p>The status of lead <strong>{{lead.name}}</strong> (contact: {{contact.name}}) has been updated.</p>
<p>Current status: <strong>{{lead.status}}</strong></p>
<p>Log in to the CRM to view the full change history and plan your next actions.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "deal_won",
    category: "sales",
    module: "crm",
    eventType: "deal_won",
    requiredSources: ["lead", "contact", "current_user", "org"],
    pl: {
      name: "Deal wygrany",
      subject: "🎉 Wygrałeś deal: {{lead.name}}!",
      body: `<p>Gratulacje {{current_user.name}}! 🏆</p>
<p>Deal <strong>{{lead.name}}</strong> z klientem <strong>{{contact.name}}</strong> został oznaczony jako wygrany.</p>
<p>Wartość dealu: <strong>{{lead.value}}</strong></p>
<p>Wspaniała robota! Zaloguj się do systemu, aby sfinalizować dokumentację i zaplanować onboarding klienta.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Deal Won",
      subject: "🎉 You won the deal: {{lead.name}}!",
      body: `<p>Congratulations {{current_user.name}}! 🏆</p>
<p>Deal <strong>{{lead.name}}</strong> with client <strong>{{contact.name}}</strong> has been marked as won.</p>
<p>Deal value: <strong>{{lead.value}}</strong></p>
<p>Great work! Log in to finalize the documentation and plan the client onboarding.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "deal_lost",
    category: "sales",
    module: "crm",
    eventType: "deal_lost",
    requiredSources: ["lead", "contact", "current_user", "org"],
    pl: {
      name: "Deal przegrany",
      subject: "Deal {{lead.name}} — oznaczony jako przegrany",
      body: `<p>Cześć {{current_user.name}},</p>
<p>Deal <strong>{{lead.name}}</strong> z klientem <strong>{{contact.name}}</strong> został oznaczony jako przegrany.</p>
<p>Powód: <strong>{{lead.lost_reason}}</strong></p>
<p>Każda porażka to lekcja na przyszłość. Zaloguj się do systemu, aby przeprowadzić analizę przegranej szansy i wyciągnąć wnioski na przyszłość.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Deal Lost",
      subject: "Deal {{lead.name}} — marked as lost",
      body: `<p>Hi {{current_user.name}},</p>
<p>Deal <strong>{{lead.name}}</strong> with client <strong>{{contact.name}}</strong> has been marked as lost.</p>
<p>Reason: <strong>{{lead.lost_reason}}</strong></p>
<p>Every setback is a lesson for the future. Log in to review the lost opportunity and extract insights for next time.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "deal_stage_changed",
    category: "sales",
    module: "crm",
    eventType: "deal_stage_changed",
    requiredSources: ["lead", "contact", "current_user", "org"],
    pl: {
      name: "Zmiana etapu w pipeline",
      subject: "Deal {{lead.name}} przesunięty do nowego etapu",
      body: `<p>Cześć {{current_user.name}},</p>
<p>Deal <strong>{{lead.name}}</strong> (kontakt: {{contact.name}}) został przesunięty do nowego etapu w pipeline.</p>
<p>Aktualny etap: <strong>{{lead.stage}}</strong></p>
<p>Zaloguj się do systemu, aby zaplanować działania wymagane na tym etapie.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Deal Stage Changed",
      subject: "Deal {{lead.name}} moved to a new stage",
      body: `<p>Hi {{current_user.name}},</p>
<p>Deal <strong>{{lead.name}}</strong> (contact: {{contact.name}}) has been moved to a new pipeline stage.</p>
<p>Current stage: <strong>{{lead.stage}}</strong></p>
<p>Log in to plan the actions required at this stage.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "contact_welcome",
    category: "sales",
    module: "crm",
    eventType: "contact_welcome",
    requiredSources: ["contact", "org"],
    pl: {
      name: "Powitanie kontaktu",
      subject: "Witaj w {{org.name}}, {{contact.name}}!",
      body: `<p>Cześć {{contact.name}},</p>
<p>Cieszymy się, że dołączyłeś do grona naszych klientów i kontaktów w <strong>{{org.name}}</strong>.</p>
<p>Chcielibyśmy poznać Twoje potrzeby i zobaczyć, jak możemy Ci pomóc. Skontaktuj się z nami w dowolnej chwili.</p>
<p>Z poważaniem,<br>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Contact Welcome",
      subject: "Welcome to {{org.name}}, {{contact.name}}!",
      body: `<p>Hi {{contact.name}},</p>
<p>We're delighted to have you among our clients and contacts at <strong>{{org.name}}</strong>.</p>
<p>We'd love to learn about your needs and explore how we can help. Feel free to reach out at any time.</p>
<p>Best regards,<br>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "contact_birthday",
    category: "sales",
    module: "crm",
    eventType: "contact_birthday",
    requiredSources: ["contact", "org"],
    pl: {
      name: "Urodziny kontaktu",
      subject: "Wszystkiego najlepszego, {{contact.name}}! 🎂",
      body: `<p>Drogi/a {{contact.name}},</p>
<p>Cały zespół <strong>{{org.name}}</strong> składa Ci serdeczne życzenia z okazji urodzin! 🎉</p>
<p>Niech ten wyjątkowy dzień upłynie Ci jak najpiękniej, a nowy rok przyniesie wiele powodów do radości.</p>
<p>Z wyrazami szacunku i sympatii,<br>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Contact Birthday",
      subject: "Happy Birthday, {{contact.name}}! 🎂",
      body: `<p>Dear {{contact.name}},</p>
<p>The entire team at <strong>{{org.name}}</strong> wishes you a very happy birthday! 🎉</p>
<p>May this special day be wonderful and may the coming year bring you many reasons to smile.</p>
<p>Warmest regards,<br>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "quote_sent",
    category: "sales",
    module: "crm",
    eventType: "quote_sent",
    requiredSources: ["lead", "contact", "org"],
    pl: {
      name: "Oferta wysłana",
      subject: "Twoja oferta od {{org.name}} — {{lead.name}}",
      body: `<p>Drogi/a {{contact.name}},</p>
<p>Dziękujemy za zainteresowanie naszą ofertą. W załączniku znajdziesz przygotowaną dla Ciebie propozycję dotyczącą <strong>{{lead.name}}</strong>.</p>
<p>Oferta jest ważna do: <strong>{{lead.expiry_date}}</strong></p>
<p>Jeśli masz pytania lub chcesz omówić szczegóły, skontaktuj się z nami bezpośrednio — z przyjemnością odpowiemy na wszelkie wątpliwości.</p>
<p>Z poważaniem,<br>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Quote Sent",
      subject: "Your quote from {{org.name}} — {{lead.name}}",
      body: `<p>Dear {{contact.name}},</p>
<p>Thank you for your interest in our services. Please find attached the proposal we have prepared for you regarding <strong>{{lead.name}}</strong>.</p>
<p>This offer is valid until: <strong>{{lead.expiry_date}}</strong></p>
<p>If you have any questions or would like to discuss the details, please don't hesitate to contact us — we'd be happy to clarify any points.</p>
<p>Best regards,<br>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "quote_accepted",
    category: "sales",
    module: "crm",
    eventType: "quote_accepted",
    requiredSources: ["lead", "contact", "current_user", "org"],
    pl: {
      name: "Oferta zaakceptowana",
      subject: "{{contact.name}} zaakceptował ofertę — {{lead.name}}",
      body: `<p>Cześć {{current_user.name}},</p>
<p>Świetna wiadomość! Klient <strong>{{contact.name}}</strong> zaakceptował Twoją ofertę dla <strong>{{lead.name}}</strong>.</p>
<p>Wartość umowy: <strong>{{lead.value}}</strong></p>
<p>Zaloguj się do systemu, aby sfinalizować warunki i uruchomić proces realizacji.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Quote Accepted",
      subject: "{{contact.name}} accepted the quote — {{lead.name}}",
      body: `<p>Hi {{current_user.name}},</p>
<p>Great news! Client <strong>{{contact.name}}</strong> has accepted your quote for <strong>{{lead.name}}</strong>.</p>
<p>Contract value: <strong>{{lead.value}}</strong></p>
<p>Log in to finalize the terms and kick off the fulfillment process.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "quote_expired",
    category: "sales",
    module: "crm",
    eventType: "quote_expired",
    requiredSources: ["lead", "contact", "current_user", "org"],
    pl: {
      name: "Oferta wygasła",
      subject: "Oferta {{lead.name}} dla {{contact.name}} wygasła",
      body: `<p>Cześć {{current_user.name}},</p>
<p>Oferta <strong>{{lead.name}}</strong> wysłana do klienta <strong>{{contact.name}}</strong> wygasła bez odpowiedzi.</p>
<p>Data wygaśnięcia: <strong>{{lead.expiry_date}}</strong></p>
<p>Rozważ kontakt z klientem, aby zapytać o zainteresowanie lub zaproponować nową ofertę.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Quote Expired",
      subject: "Quote {{lead.name}} for {{contact.name}} has expired",
      body: `<p>Hi {{current_user.name}},</p>
<p>The quote <strong>{{lead.name}}</strong> sent to client <strong>{{contact.name}}</strong> has expired without a response.</p>
<p>Expiry date: <strong>{{lead.expiry_date}}</strong></p>
<p>Consider reaching out to the client to check their interest or propose a new offer.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
];

// ---------------------------------------------------------------------------
// CRM / Activities (5)
// ---------------------------------------------------------------------------

const CRM_ACTIVITIES_TEMPLATES: SystemTemplateDef[] = [
  {
    slug: "activity_reminder",
    category: "activities",
    module: "crm",
    eventType: "activity_reminder",
    requiredSources: ["contact", "current_user", "org"],
    pl: {
      name: "Przypomnienie o zadaniu",
      subject: "Przypomnienie: zaplanowane zadanie — {{contact.name}}",
      body: `<p>Cześć {{current_user.name}},</p>
<p>To przypomnienie o zaplanowanym zadaniu związanym z kontaktem <strong>{{contact.name}}</strong>.</p>
<p>Zaloguj się do systemu CRM, aby zobaczyć szczegóły i zaktualizować status zadania.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Activity Reminder",
      subject: "Reminder: scheduled activity — {{contact.name}}",
      body: `<p>Hi {{current_user.name}},</p>
<p>This is a reminder about a scheduled activity related to contact <strong>{{contact.name}}</strong>.</p>
<p>Log in to the CRM to view the details and update the activity status.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "activity_overdue",
    category: "activities",
    module: "crm",
    eventType: "activity_overdue",
    requiredSources: ["contact", "current_user", "org"],
    pl: {
      name: "Zaległe zadanie",
      subject: "Zaległe zadanie — {{contact.name}}",
      body: `<p>Cześć {{current_user.name}},</p>
<p>Masz zaległe zadanie związane z kontaktem <strong>{{contact.name}}</strong>, które nie zostało jeszcze ukończone.</p>
<p>Zaloguj się do systemu, aby zamknąć lub przełożyć to zadanie.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Overdue Activity",
      subject: "Overdue activity — {{contact.name}}",
      body: `<p>Hi {{current_user.name}},</p>
<p>You have an overdue activity related to contact <strong>{{contact.name}}</strong> that hasn't been completed yet.</p>
<p>Log in to close or reschedule this activity.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "activity_assigned",
    category: "activities",
    module: "crm",
    eventType: "activity_assigned",
    requiredSources: ["contact", "current_user", "org"],
    pl: {
      name: "Nowe zadanie przypisane",
      subject: "Przypisano Ci nowe zadanie — {{contact.name}}",
      body: `<p>Cześć {{current_user.name}},</p>
<p>Przypisano Ci nowe zadanie związane z kontaktem <strong>{{contact.name}}</strong>.</p>
<p>Zaloguj się do systemu CRM, aby zobaczyć szczegóły zadania i podjąć działania.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Activity Assigned",
      subject: "A new activity has been assigned to you — {{contact.name}}",
      body: `<p>Hi {{current_user.name}},</p>
<p>A new activity has been assigned to you related to contact <strong>{{contact.name}}</strong>.</p>
<p>Log in to the CRM to view the activity details and take action.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "activity_completed",
    category: "activities",
    module: "crm",
    eventType: "activity_completed",
    requiredSources: ["contact", "current_user", "org"],
    pl: {
      name: "Zadanie ukończone",
      subject: "Zadanie ukończone — {{contact.name}}",
      body: `<p>Cześć {{current_user.name}},</p>
<p>Zadanie związane z kontaktem <strong>{{contact.name}}</strong> zostało oznaczone jako ukończone.</p>
<p>Zaloguj się do systemu, aby zaplanować kolejne kroki lub zamknąć temat.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Activity Completed",
      subject: "Activity completed — {{contact.name}}",
      body: `<p>Hi {{current_user.name}},</p>
<p>The activity related to contact <strong>{{contact.name}}</strong> has been marked as completed.</p>
<p>Log in to plan the next steps or close out the topic.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "call_scheduled",
    category: "activities",
    module: "crm",
    eventType: "call_scheduled",
    requiredSources: ["contact", "current_user", "org"],
    pl: {
      name: "Zaplanowana rozmowa telefoniczna",
      subject: "Rozmowa zaplanowana z {{contact.name}}",
      body: `<p>Cześć {{current_user.name}},</p>
<p>Zaplanowano rozmowę telefoniczną z <strong>{{contact.name}}</strong> ({{contact.phone}}).</p>
<p>Sprawdź swój kalendarz i przygotuj się do rozmowy. Zaloguj się do systemu CRM, aby zobaczyć notatki i historię kontaktu.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Call Scheduled",
      subject: "Call scheduled with {{contact.name}}",
      body: `<p>Hi {{current_user.name}},</p>
<p>A phone call has been scheduled with <strong>{{contact.name}}</strong> ({{contact.phone}}).</p>
<p>Check your calendar and prepare for the call. Log in to the CRM to review the contact's notes and history.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
];

// ---------------------------------------------------------------------------
// CRM / Documents (5)
// ---------------------------------------------------------------------------

const CRM_DOCUMENTS_TEMPLATES: SystemTemplateDef[] = [
  {
    slug: "document_shared",
    category: "documents",
    module: "crm",
    eventType: "document_shared",
    requiredSources: ["contact", "current_user", "org"],
    pl: {
      name: "Dokument udostępniony",
      subject: "{{current_user.name}} udostępnił Ci dokument",
      body: `<p>Drogi/a {{contact.name}},</p>
<p><strong>{{current_user.name}}</strong> z firmy <strong>{{org.name}}</strong> udostępnił Ci dokument do wglądu.</p>
<p>Kliknij poniższy link, aby uzyskać dostęp do dokumentu:</p>
<p><a href="{{current_user.document_url}}">Otwórz dokument</a></p>
<p>Jeśli masz pytania, skontaktuj się z {{current_user.name}} pod adresem {{current_user.email}}.</p>
<p>Z poważaniem,<br>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Document Shared",
      subject: "{{current_user.name}} has shared a document with you",
      body: `<p>Dear {{contact.name}},</p>
<p><strong>{{current_user.name}}</strong> from <strong>{{org.name}}</strong> has shared a document with you for review.</p>
<p>Click the link below to access the document:</p>
<p><a href="{{current_user.document_url}}">Open document</a></p>
<p>If you have any questions, contact {{current_user.name}} at {{current_user.email}}.</p>
<p>Best regards,<br>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "document_signed",
    category: "documents",
    module: "crm",
    eventType: "document_signed",
    requiredSources: ["contact", "current_user", "org"],
    pl: {
      name: "Dokument podpisany",
      subject: "{{contact.name}} podpisał dokument",
      body: `<p>Cześć {{current_user.name}},</p>
<p><strong>{{contact.name}}</strong> właśnie podpisał dokument w systemie {{org.name}}.</p>
<p>Zaloguj się do systemu, aby pobrać podpisany egzemplarz i zaktualizować status sprawy.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Document Signed",
      subject: "{{contact.name}} has signed the document",
      body: `<p>Hi {{current_user.name}},</p>
<p><strong>{{contact.name}}</strong> has just signed the document in the {{org.name}} system.</p>
<p>Log in to download the signed copy and update the status of the case.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "document_signature_request",
    category: "documents",
    module: "crm",
    eventType: "document_signature_request",
    requiredSources: ["contact", "current_user", "org"],
    pl: {
      name: "Prośba o podpis dokumentu",
      subject: "Prośba o podpis dokumentu od {{org.name}}",
      body: `<p>Drogi/a {{contact.name}},</p>
<p><strong>{{current_user.name}}</strong> z firmy <strong>{{org.name}}</strong> prosi Cię o podpisanie dokumentu.</p>
<p>Kliknij poniższy link, aby przejrzeć i podpisać dokument:</p>
<p><a href="{{current_user.signing_url}}">Podpisz dokument</a></p>
<p>Jeśli masz pytania dotyczące dokumentu, skontaktuj się z nami pod adresem {{current_user.email}}.</p>
<p>Z poważaniem,<br>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Document Signature Request",
      subject: "Signature request from {{org.name}}",
      body: `<p>Dear {{contact.name}},</p>
<p><strong>{{current_user.name}}</strong> from <strong>{{org.name}}</strong> is requesting your signature on a document.</p>
<p>Click the link below to review and sign the document:</p>
<p><a href="{{current_user.signing_url}}">Sign document</a></p>
<p>If you have questions about the document, contact us at {{current_user.email}}.</p>
<p>Best regards,<br>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "document_expired",
    category: "documents",
    module: "crm",
    eventType: "document_expired",
    requiredSources: ["contact", "current_user", "org"],
    pl: {
      name: "Dokument wygasł",
      subject: "Dokument wygasł — wymagane działanie",
      body: `<p>Cześć {{current_user.name}},</p>
<p>Dokument powiązany z kontaktem <strong>{{contact.name}}</strong> wygasł i wymaga odnowienia lub archiwizacji.</p>
<p>Zaloguj się do systemu, aby zarządzać dokumentem.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Document Expired",
      subject: "Document expired — action required",
      body: `<p>Hi {{current_user.name}},</p>
<p>A document associated with contact <strong>{{contact.name}}</strong> has expired and requires renewal or archiving.</p>
<p>Log in to manage the document.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "document_comment",
    category: "documents",
    module: "crm",
    eventType: "document_comment",
    requiredSources: ["contact", "current_user", "org"],
    pl: {
      name: "Komentarz do dokumentu",
      subject: "Nowy komentarz do dokumentu od {{contact.name}}",
      body: `<p>Cześć {{current_user.name}},</p>
<p><strong>{{contact.name}}</strong> dodał nowy komentarz do dokumentu w systemie {{org.name}}.</p>
<p>Zaloguj się do systemu, aby zobaczyć komentarz i odpowiedzieć.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Document Comment",
      subject: "New comment on document from {{contact.name}}",
      body: `<p>Hi {{current_user.name}},</p>
<p><strong>{{contact.name}}</strong> has added a new comment to a document in the {{org.name}} system.</p>
<p>Log in to view the comment and respond.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
];

// ---------------------------------------------------------------------------
// CRM / Pipeline (5)
// ---------------------------------------------------------------------------

const CRM_PIPELINE_TEMPLATES: SystemTemplateDef[] = [
  {
    slug: "pipeline_stage_entered",
    category: "pipeline",
    module: "crm",
    eventType: "pipeline_stage_entered",
    requiredSources: ["lead", "contact", "current_user", "org"],
    pl: {
      name: "Deal wszedł na nowy etap",
      subject: "Deal {{lead.name}} — nowy etap: {{lead.stage}}",
      body: `<p>Cześć {{current_user.name}},</p>
<p>Deal <strong>{{lead.name}}</strong> z klientem <strong>{{contact.name}}</strong> wkroczył na nowy etap pipeline: <strong>{{lead.stage}}</strong>.</p>
<p>Zaloguj się do systemu, aby wykonać wymagane działania dla tego etapu.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Pipeline Stage Entered",
      subject: "Deal {{lead.name}} — new stage: {{lead.stage}}",
      body: `<p>Hi {{current_user.name}},</p>
<p>Deal <strong>{{lead.name}}</strong> with client <strong>{{contact.name}}</strong> has entered a new pipeline stage: <strong>{{lead.stage}}</strong>.</p>
<p>Log in to perform the required actions for this stage.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "pipeline_deal_stalled",
    category: "pipeline",
    module: "crm",
    eventType: "pipeline_deal_stalled",
    requiredSources: ["lead", "contact", "current_user", "org"],
    pl: {
      name: "Deal zablokowany w pipeline",
      subject: "Uwaga: deal {{lead.name}} nie ma aktywności od kilku dni",
      body: `<p>Cześć {{current_user.name}},</p>
<p>Deal <strong>{{lead.name}}</strong> z klientem <strong>{{contact.name}}</strong> nie ma żadnej aktywności od dłuższego czasu.</p>
<p>Aktualny etap: <strong>{{lead.stage}}</strong> | Wartość: <strong>{{lead.value}}</strong></p>
<p>Zaloguj się do systemu, aby sprawdzić status i podjąć działania, zanim szansa przepadnie.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Pipeline Deal Stalled",
      subject: "Alert: deal {{lead.name}} has had no activity for several days",
      body: `<p>Hi {{current_user.name}},</p>
<p>Deal <strong>{{lead.name}}</strong> with client <strong>{{contact.name}}</strong> has had no activity for an extended period.</p>
<p>Current stage: <strong>{{lead.stage}}</strong> | Value: <strong>{{lead.value}}</strong></p>
<p>Log in to check the status and take action before the opportunity is lost.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "pipeline_weekly_summary",
    category: "pipeline",
    module: "crm",
    eventType: "pipeline_weekly_summary",
    requiredSources: ["current_user", "org"],
    pl: {
      name: "Tygodniowe podsumowanie pipeline",
      subject: "Podsumowanie tygodnia — pipeline {{org.name}}",
      body: `<p>Cześć {{current_user.name}},</p>
<p>Oto tygodniowe podsumowanie aktywności w pipeline <strong>{{org.name}}</strong>.</p>
<p>Zaloguj się do systemu, aby zobaczyć szczegółowe statystyki, raporty i prognozę sprzedaży na następny tydzień.</p>
<p>Udanego tygodnia!</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Pipeline Weekly Summary",
      subject: "Weekly summary — {{org.name}} pipeline",
      body: `<p>Hi {{current_user.name}},</p>
<p>Here is your weekly pipeline activity summary for <strong>{{org.name}}</strong>.</p>
<p>Log in to view detailed stats, reports, and the sales forecast for the coming week.</p>
<p>Have a great week!</p>
<p>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "pipeline_monthly_report",
    category: "pipeline",
    module: "crm",
    eventType: "pipeline_monthly_report",
    requiredSources: ["current_user", "org"],
    pl: {
      name: "Miesięczny raport pipeline",
      subject: "Raport miesięczny — pipeline {{org.name}}",
      body: `<p>Cześć {{current_user.name}},</p>
<p>Twój miesięczny raport aktywności pipeline dla <strong>{{org.name}}</strong> jest gotowy.</p>
<p>Zaloguj się do systemu, aby zobaczyć pełne podsumowanie wyników, analizę konwersji i rekomendacje na kolejny miesiąc.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Pipeline Monthly Report",
      subject: "Monthly report — {{org.name}} pipeline",
      body: `<p>Hi {{current_user.name}},</p>
<p>Your monthly pipeline activity report for <strong>{{org.name}}</strong> is ready.</p>
<p>Log in to view the full performance summary, conversion analysis, and recommendations for the next month.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "pipeline_quota_alert",
    category: "pipeline",
    module: "crm",
    eventType: "pipeline_quota_alert",
    requiredSources: ["current_user", "org"],
    pl: {
      name: "Alert o realizacji kwoty sprzedaży",
      subject: "Alert: realizacja kwoty sprzedaży wymaga uwagi",
      body: `<p>Cześć {{current_user.name}},</p>
<p>Aktualny postęp realizacji kwoty sprzedaży w <strong>{{org.name}}</strong> wymaga Twojej uwagi.</p>
<p>Zaloguj się do systemu, aby sprawdzić aktualne wyniki, zidentyfikować szanse do domknięcia i podjąć działania zaradcze.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Pipeline Quota Alert",
      subject: "Alert: sales quota progress needs attention",
      body: `<p>Hi {{current_user.name}},</p>
<p>The current sales quota progress at <strong>{{org.name}}</strong> requires your attention.</p>
<p>Log in to review current results, identify opportunities to close, and take corrective action.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
];

// ---------------------------------------------------------------------------
// Gabinet / Appointments (10)
// ---------------------------------------------------------------------------

const GABINET_APPOINTMENTS_TEMPLATES: SystemTemplateDef[] = [
  {
    slug: "appointment_confirmation",
    category: "appointments",
    module: "gabinet",
    eventType: "appointment_confirmation",
    requiredSources: ["patient", "appointment", "org"],
    pl: {
      name: "Potwierdzenie wizyty",
      subject: "Potwierdzenie wizyty — {{appointment.date}} {{appointment.time}}",
      body: `<p>Drogi/a {{patient.name}},</p>
<p>Potwierdzamy Twoją wizytę w <strong>{{org.name}}</strong>:</p>
<table>
  <tr><td><strong>Data:</strong></td><td>{{appointment.date}}</td></tr>
  <tr><td><strong>Godzina:</strong></td><td>{{appointment.time}}</td></tr>
  <tr><td><strong>Zabieg:</strong></td><td>{{appointment.treatment_name}}</td></tr>
  <tr><td><strong>Specjalista:</strong></td><td>{{appointment.employee_name}}</td></tr>
</table>
<p>Jeśli musisz odwołać lub przełożyć wizytę, zrób to co najmniej 24 godziny wcześniej. W razie pytań skontaktuj się z nami pod adresem {{org.email}} lub telefonicznie {{org.phone}}.</p>
<p>Do zobaczenia!<br>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Appointment Confirmation",
      subject: "Appointment confirmation — {{appointment.date}} {{appointment.time}}",
      body: `<p>Dear {{patient.name}},</p>
<p>We confirm your appointment at <strong>{{org.name}}</strong>:</p>
<table>
  <tr><td><strong>Date:</strong></td><td>{{appointment.date}}</td></tr>
  <tr><td><strong>Time:</strong></td><td>{{appointment.time}}</td></tr>
  <tr><td><strong>Treatment:</strong></td><td>{{appointment.treatment_name}}</td></tr>
  <tr><td><strong>Specialist:</strong></td><td>{{appointment.employee_name}}</td></tr>
</table>
<p>If you need to cancel or reschedule, please do so at least 24 hours in advance. For questions contact us at {{org.email}} or {{org.phone}}.</p>
<p>See you soon!<br>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "appointment_reminder_24h",
    category: "appointments",
    module: "gabinet",
    eventType: "appointment_reminder_24h",
    requiredSources: ["patient", "appointment", "org"],
    pl: {
      name: "Przypomnienie o wizycie (24h)",
      subject: "Przypomnienie: wizyta jutro o {{appointment.time}}",
      body: `<p>Drogi/a {{patient.name}},</p>
<p>Przypominamy, że jutro masz zaplanowaną wizytę w <strong>{{org.name}}</strong>:</p>
<table>
  <tr><td><strong>Data:</strong></td><td>{{appointment.date}}</td></tr>
  <tr><td><strong>Godzina:</strong></td><td>{{appointment.time}}</td></tr>
  <tr><td><strong>Zabieg:</strong></td><td>{{appointment.treatment_name}}</td></tr>
  <tr><td><strong>Specjalista:</strong></td><td>{{appointment.employee_name}}</td></tr>
</table>
<p>Jeśli nie możesz się stawić, odwołaj wizytę jak najszybciej pod numerem {{org.phone}}.</p>
<p>Do zobaczenia!<br>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Appointment Reminder (24h)",
      subject: "Reminder: appointment tomorrow at {{appointment.time}}",
      body: `<p>Dear {{patient.name}},</p>
<p>This is a reminder that you have an appointment at <strong>{{org.name}}</strong> tomorrow:</p>
<table>
  <tr><td><strong>Date:</strong></td><td>{{appointment.date}}</td></tr>
  <tr><td><strong>Time:</strong></td><td>{{appointment.time}}</td></tr>
  <tr><td><strong>Treatment:</strong></td><td>{{appointment.treatment_name}}</td></tr>
  <tr><td><strong>Specialist:</strong></td><td>{{appointment.employee_name}}</td></tr>
</table>
<p>If you can't make it, please cancel as soon as possible by calling {{org.phone}}.</p>
<p>See you tomorrow!<br>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "appointment_reminder_1h",
    category: "appointments",
    module: "gabinet",
    eventType: "appointment_reminder_1h",
    requiredSources: ["patient", "appointment", "org"],
    pl: {
      name: "Przypomnienie o wizycie (1h)",
      subject: "Twoja wizyta za godzinę — {{appointment.time}}",
      body: `<p>Drogi/a {{patient.name}},</p>
<p>Twoja wizyta w <strong>{{org.name}}</strong> zaczyna się za godzinę!</p>
<p>Zabieg: <strong>{{appointment.treatment_name}}</strong> | Specjalista: <strong>{{appointment.employee_name}}</strong></p>
<p>Do zobaczenia za chwilę!</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Appointment Reminder (1h)",
      subject: "Your appointment is in 1 hour — {{appointment.time}}",
      body: `<p>Dear {{patient.name}},</p>
<p>Your appointment at <strong>{{org.name}}</strong> starts in one hour!</p>
<p>Treatment: <strong>{{appointment.treatment_name}}</strong> | Specialist: <strong>{{appointment.employee_name}}</strong></p>
<p>See you shortly!</p>
<p>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "appointment_cancelled",
    category: "appointments",
    module: "gabinet",
    eventType: "appointment_cancelled",
    requiredSources: ["patient", "appointment", "org"],
    pl: {
      name: "Odwołanie wizyty",
      subject: "Wizyta odwołana — {{appointment.date}} {{appointment.time}}",
      body: `<p>Drogi/a {{patient.name}},</p>
<p>Informujemy, że wizyta zaplanowana na <strong>{{appointment.date}}</strong> o godzinie <strong>{{appointment.time}}</strong> w <strong>{{org.name}}</strong> została odwołana.</p>
<p>Jeśli chcesz umówić nowy termin, skontaktuj się z nami pod adresem {{org.email}} lub telefonicznie {{org.phone}}.</p>
<p>Przepraszamy za niedogodności.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Appointment Cancelled",
      subject: "Appointment cancelled — {{appointment.date}} {{appointment.time}}",
      body: `<p>Dear {{patient.name}},</p>
<p>We would like to inform you that your appointment scheduled for <strong>{{appointment.date}}</strong> at <strong>{{appointment.time}}</strong> at <strong>{{org.name}}</strong> has been cancelled.</p>
<p>If you would like to book a new appointment, please contact us at {{org.email}} or call {{org.phone}}.</p>
<p>We apologize for any inconvenience.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "appointment_rescheduled",
    category: "appointments",
    module: "gabinet",
    eventType: "appointment_rescheduled",
    requiredSources: ["patient", "appointment", "org"],
    pl: {
      name: "Wizyta przełożona",
      subject: "Wizyta przełożona — nowy termin: {{appointment.date}} {{appointment.time}}",
      body: `<p>Drogi/a {{patient.name}},</p>
<p>Twoja wizyta w <strong>{{org.name}}</strong> została przełożona na nowy termin:</p>
<table>
  <tr><td><strong>Nowa data:</strong></td><td>{{appointment.date}}</td></tr>
  <tr><td><strong>Nowa godzina:</strong></td><td>{{appointment.time}}</td></tr>
  <tr><td><strong>Zabieg:</strong></td><td>{{appointment.treatment_name}}</td></tr>
  <tr><td><strong>Specjalista:</strong></td><td>{{appointment.employee_name}}</td></tr>
</table>
<p>Jeśli nowy termin Ci nie odpowiada, skontaktuj się z nami pod numerem {{org.phone}}.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Appointment Rescheduled",
      subject: "Appointment rescheduled — new time: {{appointment.date}} {{appointment.time}}",
      body: `<p>Dear {{patient.name}},</p>
<p>Your appointment at <strong>{{org.name}}</strong> has been rescheduled to a new time:</p>
<table>
  <tr><td><strong>New date:</strong></td><td>{{appointment.date}}</td></tr>
  <tr><td><strong>New time:</strong></td><td>{{appointment.time}}</td></tr>
  <tr><td><strong>Treatment:</strong></td><td>{{appointment.treatment_name}}</td></tr>
  <tr><td><strong>Specialist:</strong></td><td>{{appointment.employee_name}}</td></tr>
</table>
<p>If the new time doesn't work for you, please contact us at {{org.phone}}.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "appointment_no_show",
    category: "appointments",
    module: "gabinet",
    eventType: "appointment_no_show",
    requiredSources: ["patient", "appointment", "org"],
    pl: {
      name: "Niestawienie się na wizytę",
      subject: "Nie pojawiłeś się na wizycie — {{appointment.date}}",
      body: `<p>Drogi/a {{patient.name}},</p>
<p>Zauważyliśmy, że nie stawiłeś/aś się na wizytę zaplanowaną na <strong>{{appointment.date}}</strong> o <strong>{{appointment.time}}</strong> w <strong>{{org.name}}</strong>.</p>
<p>Jeśli chcesz umówić nowy termin, skontaktuj się z nami pod adresem {{org.email}} lub telefonicznie {{org.phone}}. Chętnie znajdziemy dla Ciebie odpowiedni termin.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Appointment No-Show",
      subject: "You missed your appointment — {{appointment.date}}",
      body: `<p>Dear {{patient.name}},</p>
<p>We noticed that you did not attend your appointment scheduled for <strong>{{appointment.date}}</strong> at <strong>{{appointment.time}}</strong> at <strong>{{org.name}}</strong>.</p>
<p>If you would like to reschedule, please contact us at {{org.email}} or call {{org.phone}}. We'll be happy to find a suitable time for you.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "appointment_completed",
    category: "appointments",
    module: "gabinet",
    eventType: "appointment_completed",
    requiredSources: ["patient", "appointment", "org"],
    pl: {
      name: "Wizyta zakończona",
      subject: "Dziękujemy za wizytę w {{org.name}}",
      body: `<p>Drogi/a {{patient.name}},</p>
<p>Dziękujemy za dzisiejszą wizytę w <strong>{{org.name}}</strong> (zabieg: {{appointment.treatment_name}}).</p>
<p>Mamy nadzieję, że jesteś zadowolony/a z efektów. Jeśli masz jakiekolwiek pytania po zabiegu lub chcesz umówić kolejną wizytę, jesteśmy do Twojej dyspozycji.</p>
<p>Dbaj o siebie!</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Appointment Completed",
      subject: "Thank you for visiting {{org.name}}",
      body: `<p>Dear {{patient.name}},</p>
<p>Thank you for your visit at <strong>{{org.name}}</strong> today (treatment: {{appointment.treatment_name}}).</p>
<p>We hope you're happy with the results. If you have any post-treatment questions or would like to book your next appointment, we're here to help.</p>
<p>Take care!</p>
<p>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "appointment_followup",
    category: "appointments",
    module: "gabinet",
    eventType: "appointment_followup",
    requiredSources: ["patient", "appointment", "org"],
    pl: {
      name: "Kontrola po wizycie",
      subject: "Jak się czujesz po zabiegu? — {{org.name}}",
      body: `<p>Drogi/a {{patient.name}},</p>
<p>Minęło kilka dni od Twojej wizyty (zabieg: <strong>{{appointment.treatment_name}}</strong>) w <strong>{{org.name}}</strong>. Chcieliśmy zapytać, jak się czujesz i czy wszystko przebiega zgodnie z oczekiwaniami.</p>
<p>Jeśli masz jakiekolwiek obawy lub pytania, skontaktuj się z nami niezwłocznie pod adresem {{org.email}} lub pod numerem {{org.phone}}.</p>
<p>Życzymy zdrowia!<br>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Appointment Follow-up",
      subject: "How are you feeling after your treatment? — {{org.name}}",
      body: `<p>Dear {{patient.name}},</p>
<p>A few days have passed since your visit (treatment: <strong>{{appointment.treatment_name}}</strong>) at <strong>{{org.name}}</strong>. We wanted to check in and see how you're feeling and if everything is progressing as expected.</p>
<p>If you have any concerns or questions, please don't hesitate to contact us at {{org.email}} or {{org.phone}}.</p>
<p>Wishing you good health!<br>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "appointment_waitlist",
    category: "appointments",
    module: "gabinet",
    eventType: "appointment_waitlist",
    requiredSources: ["patient", "appointment", "org"],
    pl: {
      name: "Wolne miejsce na liście oczekujących",
      subject: "Zwolnił się termin — {{appointment.date}} {{appointment.time}}",
      body: `<p>Drogi/a {{patient.name}},</p>
<p>Mamy dla Ciebie dobrą wiadomość! Zwolnił się termin na zabieg <strong>{{appointment.treatment_name}}</strong> u specjalisty <strong>{{appointment.employee_name}}</strong> w <strong>{{org.name}}</strong>:</p>
<p><strong>Data:</strong> {{appointment.date}} | <strong>Godzina:</strong> {{appointment.time}}</p>
<p>Jeśli chcesz skorzystać z tego terminu, skontaktuj się z nami jak najszybciej pod numerem {{org.phone}} lub adresem {{org.email}}.</p>
<p>Termin jest dostępny przez ograniczony czas!</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Appointment Waitlist Slot Available",
      subject: "A slot has opened up — {{appointment.date}} {{appointment.time}}",
      body: `<p>Dear {{patient.name}},</p>
<p>Great news! A slot has opened up for treatment <strong>{{appointment.treatment_name}}</strong> with specialist <strong>{{appointment.employee_name}}</strong> at <strong>{{org.name}}</strong>:</p>
<p><strong>Date:</strong> {{appointment.date}} | <strong>Time:</strong> {{appointment.time}}</p>
<p>If you'd like to take this slot, please contact us as soon as possible at {{org.phone}} or {{org.email}}.</p>
<p>This slot is available for a limited time!</p>
<p>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "appointment_series_created",
    category: "appointments",
    module: "gabinet",
    eventType: "appointment_series_created",
    requiredSources: ["patient", "appointment", "org"],
    pl: {
      name: "Seria wizyt zaplanowana",
      subject: "Seria wizyt zaplanowana — {{org.name}}",
      body: `<p>Drogi/a {{patient.name}},</p>
<p>Zaplanowaliśmy dla Ciebie serię wizyt na zabieg <strong>{{appointment.treatment_name}}</strong> w <strong>{{org.name}}</strong>.</p>
<p>Pierwsza wizyta: <strong>{{appointment.date}}</strong> o godz. <strong>{{appointment.time}}</strong> — specjalista: <strong>{{appointment.employee_name}}</strong></p>
<p>Szczegóły wszystkich terminów znajdziesz w portalu pacjenta. Jeśli masz pytania, skontaktuj się z nami pod adresem {{org.email}}.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Appointment Series Created",
      subject: "Appointment series scheduled — {{org.name}}",
      body: `<p>Dear {{patient.name}},</p>
<p>We have scheduled a series of appointments for treatment <strong>{{appointment.treatment_name}}</strong> at <strong>{{org.name}}</strong>.</p>
<p>First appointment: <strong>{{appointment.date}}</strong> at <strong>{{appointment.time}}</strong> — specialist: <strong>{{appointment.employee_name}}</strong></p>
<p>Full details of all appointments are available in your patient portal. For questions, contact us at {{org.email}}.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
];

// ---------------------------------------------------------------------------
// Gabinet / Patients (5)
// ---------------------------------------------------------------------------

const GABINET_PATIENTS_TEMPLATES: SystemTemplateDef[] = [
  {
    slug: "patient_welcome",
    category: "patients",
    module: "gabinet",
    eventType: "patient_welcome",
    requiredSources: ["patient", "org"],
    pl: {
      name: "Powitanie nowego pacjenta",
      subject: "Witamy w {{org.name}}, {{patient.name}}!",
      body: `<p>Drogi/a {{patient.name}},</p>
<p>Serdecznie witamy Cię w gronie pacjentów <strong>{{org.name}}</strong>!</p>
<p>Twój profil pacjenta jest już aktywny. Możesz zalogować się do portalu pacjenta, aby:</p>
<ul>
  <li>Przeglądać historię wizyt i zaplanowane terminy</li>
  <li>Przeglądać dokumentację medyczną i wyniki</li>
  <li>Zarządzać swoimi danymi kontaktowymi</li>
</ul>
<p>W razie jakichkolwiek pytań jesteśmy do Twojej dyspozycji pod adresem {{org.email}} lub telefonicznie {{org.phone}}.</p>
<p>Z wyrazami szacunku,<br>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Welcome New Patient",
      subject: "Welcome to {{org.name}}, {{patient.name}}!",
      body: `<p>Dear {{patient.name}},</p>
<p>A warm welcome to the patients of <strong>{{org.name}}</strong>!</p>
<p>Your patient profile is now active. You can log in to the patient portal to:</p>
<ul>
  <li>View your visit history and upcoming appointments</li>
  <li>Access your medical records and results</li>
  <li>Manage your contact details</li>
</ul>
<p>If you have any questions, we're here to help at {{org.email}} or {{org.phone}}.</p>
<p>Kind regards,<br>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "patient_birthday",
    category: "patients",
    module: "gabinet",
    eventType: "patient_birthday",
    requiredSources: ["patient", "org"],
    pl: {
      name: "Urodziny pacjenta",
      subject: "Wszystkiego najlepszego, {{patient.name}}! 🎂",
      body: `<p>Drogi/a {{patient.name}},</p>
<p>Cały zespół <strong>{{org.name}}</strong> składa Ci serdeczne życzenia urodzinowe! 🎉</p>
<p>Niech ten wyjątkowy dzień upłynie Ci radośnie, a zdrowie i uśmiech towarzyszą Ci przez cały kolejny rok życia.</p>
<p>Dbaj o siebie!<br>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Patient Birthday",
      subject: "Happy Birthday, {{patient.name}}! 🎂",
      body: `<p>Dear {{patient.name}},</p>
<p>The entire team at <strong>{{org.name}}</strong> wishes you a very Happy Birthday! 🎉</p>
<p>May this special day be full of joy and may good health and happiness accompany you throughout the coming year.</p>
<p>Take care!<br>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "patient_portal_invitation",
    category: "patients",
    module: "gabinet",
    eventType: "patient_portal_invitation",
    requiredSources: ["patient", "org"],
    pl: {
      name: "Zaproszenie do portalu pacjenta",
      subject: "Twój dostęp do portalu pacjenta — {{org.name}}",
      body: `<p>Drogi/a {{patient.name}},</p>
<p>Zapraszamy Cię do korzystania z portalu pacjenta <strong>{{org.name}}</strong>.</p>
<p>Portal umożliwia Ci:</p>
<ul>
  <li>Wgląd do historii wizyt i zaplanowanych terminów</li>
  <li>Dostęp do dokumentacji medycznej</li>
  <li>Komunikację z gabinetem</li>
</ul>
<p>Kliknij poniższy link, aby aktywować dostęp:</p>
<p><a href="{{patient.portal_url}}">Aktywuj dostęp do portalu</a></p>
<p>Link jest ważny przez 48 godzin.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Patient Portal Invitation",
      subject: "Your patient portal access — {{org.name}}",
      body: `<p>Dear {{patient.name}},</p>
<p>We invite you to start using the <strong>{{org.name}}</strong> patient portal.</p>
<p>The portal lets you:</p>
<ul>
  <li>View your visit history and upcoming appointments</li>
  <li>Access your medical documentation</li>
  <li>Communicate with the clinic</li>
</ul>
<p>Click the link below to activate your access:</p>
<p><a href="{{patient.portal_url}}">Activate portal access</a></p>
<p>The link expires in 48 hours.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "patient_document_ready",
    category: "patients",
    module: "gabinet",
    eventType: "patient_document_ready",
    requiredSources: ["patient", "org"],
    pl: {
      name: "Dokument pacjenta gotowy",
      subject: "Twój dokument jest gotowy do odbioru — {{org.name}}",
      body: `<p>Drogi/a {{patient.name}},</p>
<p>Informujemy, że Twój dokument jest gotowy do odbioru/pobrania w <strong>{{org.name}}</strong>.</p>
<p>Możesz zalogować się do portalu pacjenta, aby pobrać dokument, lub odebrać go osobiście podczas kolejnej wizyty.</p>
<p>W razie pytań skontaktuj się z nami pod adresem {{org.email}} lub telefonicznie {{org.phone}}.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Patient Document Ready",
      subject: "Your document is ready — {{org.name}}",
      body: `<p>Dear {{patient.name}},</p>
<p>We're pleased to inform you that your document is ready for download/collection at <strong>{{org.name}}</strong>.</p>
<p>You can log in to the patient portal to download the document, or collect it in person during your next visit.</p>
<p>For questions, please contact us at {{org.email}} or {{org.phone}}.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "patient_treatment_plan",
    category: "patients",
    module: "gabinet",
    eventType: "patient_treatment_plan",
    requiredSources: ["patient", "appointment", "org"],
    pl: {
      name: "Plan leczenia / zabiegów",
      subject: "Twój plan zabiegów — {{org.name}}",
      body: `<p>Drogi/a {{patient.name}},</p>
<p>Przygotowaliśmy dla Ciebie indywidualny plan zabiegów w <strong>{{org.name}}</strong>.</p>
<p>Szczegółowy plan, w tym daty i godziny wizyt, znajdziesz w portalu pacjenta lub możesz poprosić o wydruk podczas kolejnej wizyty.</p>
<p>W razie pytań dotyczących planu leczenia jesteśmy do Twojej dyspozycji pod adresem {{org.email}} lub telefonicznie {{org.phone}}.</p>
<p>Dbaj o siebie!<br>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Patient Treatment Plan",
      subject: "Your treatment plan — {{org.name}}",
      body: `<p>Dear {{patient.name}},</p>
<p>We have prepared a personalized treatment plan for you at <strong>{{org.name}}</strong>.</p>
<p>The full plan, including appointment dates and times, is available in your patient portal or can be requested as a printout during your next visit.</p>
<p>For any questions regarding your treatment plan, please contact us at {{org.email}} or {{org.phone}}.</p>
<p>Take care!<br>The {{org.name}} Team</p>`,
    },
  },
];

// ---------------------------------------------------------------------------
// Gabinet / Treatments (5)
// ---------------------------------------------------------------------------

const GABINET_TREATMENTS_TEMPLATES: SystemTemplateDef[] = [
  {
    slug: "treatment_aftercare",
    category: "treatments",
    module: "gabinet",
    eventType: "treatment_aftercare",
    requiredSources: ["patient", "appointment", "org"],
    pl: {
      name: "Instrukcje po zabiegu",
      subject: "Zalecenia po zabiegu {{appointment.treatment_name}} — {{org.name}}",
      body: `<p>Drogi/a {{patient.name}},</p>
<p>Dziękujemy za wizytę w <strong>{{org.name}}</strong>. Poniżej znajdziesz zalecenia pielęgnacyjne po zabiegu <strong>{{appointment.treatment_name}}</strong>.</p>
<p>Ogólne wskazówki:</p>
<ul>
  <li>Stosuj się do indywidualnych zaleceń specjalisty</li>
  <li>Unikaj drażniących substancji przez zalecony czas</li>
  <li>W przypadku niepokojących objawów skontaktuj się z nami niezwłocznie</li>
</ul>
<p>Jeśli masz jakiekolwiek pytania lub obawy, nie wahaj się skontaktować pod adresem {{org.email}} lub telefonicznie {{org.phone}}.</p>
<p>Życzymy szybkiego powrotu do zdrowia!<br>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Treatment Aftercare Instructions",
      subject: "Aftercare instructions for {{appointment.treatment_name}} — {{org.name}}",
      body: `<p>Dear {{patient.name}},</p>
<p>Thank you for your visit at <strong>{{org.name}}</strong>. Below you will find aftercare instructions following your <strong>{{appointment.treatment_name}}</strong> treatment.</p>
<p>General guidelines:</p>
<ul>
  <li>Follow the individual recommendations provided by your specialist</li>
  <li>Avoid irritating substances for the recommended period</li>
  <li>If you experience any concerning symptoms, contact us immediately</li>
</ul>
<p>If you have any questions or concerns, don't hesitate to reach out at {{org.email}} or {{org.phone}}.</p>
<p>Wishing you a speedy recovery!<br>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "treatment_package_purchased",
    category: "treatments",
    module: "gabinet",
    eventType: "treatment_package_purchased",
    requiredSources: ["patient", "org"],
    pl: {
      name: "Zakup pakietu zabiegów",
      subject: "Potwierdzenie zakupu pakietu — {{org.name}}",
      body: `<p>Drogi/a {{patient.name}},</p>
<p>Dziękujemy za zakup pakietu zabiegów w <strong>{{org.name}}</strong>!</p>
<p>Szczegóły Twojego pakietu, w tym dostępne terminy i liczba pozostałych zabiegów, są dostępne w portalu pacjenta.</p>
<p>Jeśli chcesz zarezerwować pierwszą wizytę z pakietu, skontaktuj się z nami pod adresem {{org.email}} lub telefonicznie {{org.phone}}.</p>
<p>Dziękujemy za zaufanie!<br>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Treatment Package Purchased",
      subject: "Package purchase confirmation — {{org.name}}",
      body: `<p>Dear {{patient.name}},</p>
<p>Thank you for purchasing a treatment package at <strong>{{org.name}}</strong>!</p>
<p>Details of your package, including available time slots and remaining sessions, are accessible in your patient portal.</p>
<p>To book your first package session, please contact us at {{org.email}} or {{org.phone}}.</p>
<p>Thank you for your trust!<br>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "treatment_package_expiring",
    category: "treatments",
    module: "gabinet",
    eventType: "treatment_package_expiring",
    requiredSources: ["patient", "org"],
    pl: {
      name: "Pakiet zabiegów wkrótce wygasa",
      subject: "Twój pakiet zabiegów wkrótce wygasa — {{org.name}}",
      body: `<p>Drogi/a {{patient.name}},</p>
<p>Twój pakiet zabiegów w <strong>{{org.name}}</strong> wkrótce wygasa. Pamiętaj, aby wykorzystać pozostałe zabiegi przed datą wygaśnięcia.</p>
<p>Zaloguj się do portalu pacjenta, aby sprawdzić liczbę pozostałych zabiegów i zarezerwować terminy.</p>
<p>Możesz też skontaktować się z nami pod adresem {{org.email}} lub telefonicznie {{org.phone}}, aby umówić się na wizytę.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Treatment Package Expiring",
      subject: "Your treatment package is expiring soon — {{org.name}}",
      body: `<p>Dear {{patient.name}},</p>
<p>Your treatment package at <strong>{{org.name}}</strong> is expiring soon. Please remember to use your remaining sessions before the expiry date.</p>
<p>Log in to the patient portal to check your remaining sessions and book appointments.</p>
<p>You can also contact us at {{org.email}} or {{org.phone}} to schedule your sessions.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "treatment_recommendation",
    category: "treatments",
    module: "gabinet",
    eventType: "treatment_recommendation",
    requiredSources: ["patient", "appointment", "org"],
    pl: {
      name: "Rekomendacja zabiegu",
      subject: "Polecamy dla Ciebie — {{org.name}}",
      body: `<p>Drogi/a {{patient.name}},</p>
<p>Na podstawie historii Twoich wizyt w <strong>{{org.name}}</strong> przygotowaliśmy dla Ciebie indywidualną rekomendację zabiegów, które mogą przynieść Ci korzyści.</p>
<p>Zaloguj się do portalu pacjenta lub skontaktuj się z nami pod adresem {{org.email}} czy telefonicznie {{org.phone}}, aby dowiedzieć się więcej i umówić termin.</p>
<p>Z wyrazami troski,<br>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Treatment Recommendation",
      subject: "Recommended for you — {{org.name}}",
      body: `<p>Dear {{patient.name}},</p>
<p>Based on your visit history at <strong>{{org.name}}</strong>, we've prepared personalized treatment recommendations that may benefit you.</p>
<p>Log in to the patient portal or contact us at {{org.email}} or {{org.phone}} to find out more and book an appointment.</p>
<p>With care,<br>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "treatment_consent_required",
    category: "treatments",
    module: "gabinet",
    eventType: "treatment_consent_required",
    requiredSources: ["patient", "appointment", "org"],
    pl: {
      name: "Wymagana zgoda na zabieg",
      subject: "Wymagana zgoda przed wizytą — {{appointment.date}}",
      body: `<p>Drogi/a {{patient.name}},</p>
<p>Przed wizytą zaplanowaną na <strong>{{appointment.date}}</strong> o godz. <strong>{{appointment.time}}</strong> w <strong>{{org.name}}</strong> wymagamy podpisania zgody na zabieg <strong>{{appointment.treatment_name}}</strong>.</p>
<p>Kliknij poniższy link, aby przejrzeć i podpisać zgodę przed wizytą:</p>
<p><a href="{{patient.consent_url}}">Podpisz formularz zgody</a></p>
<p>Jeśli masz pytania dotyczące zabiegu lub formularza zgody, skontaktuj się z nami pod adresem {{org.email}}.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Treatment Consent Required",
      subject: "Consent required before your appointment — {{appointment.date}}",
      body: `<p>Dear {{patient.name}},</p>
<p>Before your appointment on <strong>{{appointment.date}}</strong> at <strong>{{appointment.time}}</strong> at <strong>{{org.name}}</strong>, we require your signed consent for the <strong>{{appointment.treatment_name}}</strong> treatment.</p>
<p>Click the link below to review and sign the consent form before your visit:</p>
<p><a href="{{patient.consent_url}}">Sign consent form</a></p>
<p>If you have questions about the treatment or consent form, contact us at {{org.email}}.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
];

// ---------------------------------------------------------------------------
// Gabinet / Staff (5)
// ---------------------------------------------------------------------------

const GABINET_STAFF_TEMPLATES: SystemTemplateDef[] = [
  {
    slug: "employee_schedule_changed",
    category: "staff",
    module: "gabinet",
    eventType: "employee_schedule_changed",
    requiredSources: ["current_user", "org"],
    pl: {
      name: "Zmiana grafiku pracownika",
      subject: "Twój grafik został zmieniony — {{org.name}}",
      body: `<p>Cześć {{current_user.name}},</p>
<p>Twój grafik pracy w <strong>{{org.name}}</strong> został zaktualizowany.</p>
<p>Zaloguj się do systemu, aby zobaczyć aktualny grafik i upewnić się, że masz świadomość wszystkich zmian.</p>
<p>Jeśli masz pytania lub zastrzeżenia, skontaktuj się z przełożonym.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Employee Schedule Changed",
      subject: "Your schedule has been updated — {{org.name}}",
      body: `<p>Hi {{current_user.name}},</p>
<p>Your work schedule at <strong>{{org.name}}</strong> has been updated.</p>
<p>Log in to the system to view your current schedule and make sure you're aware of all changes.</p>
<p>If you have any questions or concerns, please contact your supervisor.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "employee_leave_approved",
    category: "staff",
    module: "gabinet",
    eventType: "employee_leave_approved",
    requiredSources: ["current_user", "org"],
    pl: {
      name: "Urlop zatwierdzony",
      subject: "Twój wniosek urlopowy został zatwierdzony — {{org.name}}",
      body: `<p>Cześć {{current_user.name}},</p>
<p>Twój wniosek urlopowy w <strong>{{org.name}}</strong> został zatwierdzony.</p>
<p>Zaloguj się do systemu, aby zobaczyć szczegóły zatwierdzonego urlopu, w tym daty i saldo dni urlopowych.</p>
<p>Miłego wypoczynku!<br>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Leave Request Approved",
      subject: "Your leave request has been approved — {{org.name}}",
      body: `<p>Hi {{current_user.name}},</p>
<p>Your leave request at <strong>{{org.name}}</strong> has been approved.</p>
<p>Log in to the system to view the details of your approved leave, including dates and remaining leave balance.</p>
<p>Enjoy your time off!<br>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "employee_leave_rejected",
    category: "staff",
    module: "gabinet",
    eventType: "employee_leave_rejected",
    requiredSources: ["current_user", "org"],
    pl: {
      name: "Urlop odrzucony",
      subject: "Twój wniosek urlopowy został odrzucony — {{org.name}}",
      body: `<p>Cześć {{current_user.name}},</p>
<p>Niestety, Twój wniosek urlopowy w <strong>{{org.name}}</strong> nie mógł zostać zatwierdzony w tym terminie.</p>
<p>Zaloguj się do systemu, aby zobaczyć szczegóły i skontaktuj się z przełożonym, aby omówić alternatywne terminy.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Leave Request Rejected",
      subject: "Your leave request has been rejected — {{org.name}}",
      body: `<p>Hi {{current_user.name}},</p>
<p>Unfortunately, your leave request at <strong>{{org.name}}</strong> could not be approved for the requested dates.</p>
<p>Log in to the system to see the details and contact your supervisor to discuss alternative dates.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "employee_overtime_alert",
    category: "staff",
    module: "gabinet",
    eventType: "employee_overtime_alert",
    requiredSources: ["current_user", "org"],
    pl: {
      name: "Alert o nadgodzinach",
      subject: "Przekroczono limit godzin pracy — {{org.name}}",
      body: `<p>Cześć {{current_user.name}},</p>
<p>System <strong>{{org.name}}</strong> wykrył przekroczenie standardowego limitu godzin pracy w bieżącym okresie rozliczeniowym.</p>
<p>Zaloguj się do systemu, aby zobaczyć szczegóły ewidencji czasu pracy i zgłosić nadgodziny do zatwierdzenia przez przełożonego.</p>
<p>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Overtime Alert",
      subject: "Working hours limit exceeded — {{org.name}}",
      body: `<p>Hi {{current_user.name}},</p>
<p>The <strong>{{org.name}}</strong> system has detected that you've exceeded the standard working hours limit in the current settlement period.</p>
<p>Log in to the system to review your time records and submit overtime for your supervisor's approval.</p>
<p>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "employee_shift_reminder",
    category: "staff",
    module: "gabinet",
    eventType: "employee_shift_reminder",
    requiredSources: ["current_user", "org"],
    pl: {
      name: "Przypomnienie o zmianie",
      subject: "Przypomnienie: Twoja zmiana zaczyna się jutro — {{org.name}}",
      body: `<p>Cześć {{current_user.name}},</p>
<p>Przypomnienie: Twoja zmiana w <strong>{{org.name}}</strong> zaczyna się jutro.</p>
<p>Zaloguj się do systemu, aby sprawdzić szczegóły zmiany, przypisanych pacjentów i zaplanowane zabiegi.</p>
<p>Dobrego dnia!<br>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Shift Reminder",
      subject: "Reminder: your shift starts tomorrow — {{org.name}}",
      body: `<p>Hi {{current_user.name}},</p>
<p>This is a reminder that your shift at <strong>{{org.name}}</strong> starts tomorrow.</p>
<p>Log in to the system to review your shift details, assigned patients, and scheduled treatments.</p>
<p>Have a great day!<br>The {{org.name}} Team</p>`,
    },
  },
];

// ---------------------------------------------------------------------------
// Gabinet / Loyalty (5)
// ---------------------------------------------------------------------------

const GABINET_LOYALTY_TEMPLATES: SystemTemplateDef[] = [
  {
    slug: "loyalty_points_earned",
    category: "loyalty",
    module: "gabinet",
    eventType: "loyalty_points_earned",
    requiredSources: ["patient", "org"],
    pl: {
      name: "Punkty lojalnościowe — naliczenie",
      subject: "Zdobyłeś nowe punkty lojalnościowe — {{org.name}}",
      body: `<p>Drogi/a {{patient.name}},</p>
<p>Gratulujemy! Po ostatniej wizycie w <strong>{{org.name}}</strong> naliczono Ci nowe punkty lojalnościowe.</p>
<p>Zaloguj się do portalu pacjenta, aby sprawdzić aktualne saldo punktów i dostępne nagrody.</p>
<p>Dziękujemy za lojalność!<br>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Loyalty Points Earned",
      subject: "You've earned new loyalty points — {{org.name}}",
      body: `<p>Dear {{patient.name}},</p>
<p>Congratulations! Following your recent visit at <strong>{{org.name}}</strong>, new loyalty points have been added to your account.</p>
<p>Log in to the patient portal to check your current points balance and available rewards.</p>
<p>Thank you for your loyalty!<br>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "loyalty_points_redeemed",
    category: "loyalty",
    module: "gabinet",
    eventType: "loyalty_points_redeemed",
    requiredSources: ["patient", "org"],
    pl: {
      name: "Punkty lojalnościowe — wykorzystanie",
      subject: "Punkty lojalnościowe zostały wykorzystane — {{org.name}}",
      body: `<p>Drogi/a {{patient.name}},</p>
<p>Potwierdzamy, że punkty lojalnościowe z Twojego konta w <strong>{{org.name}}</strong> zostały pomyślnie zrealizowane.</p>
<p>Zaloguj się do portalu pacjenta, aby sprawdzić aktualne saldo punktów.</p>
<p>Dziękujemy za korzystanie z programu lojalnościowego!<br>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Loyalty Points Redeemed",
      subject: "Loyalty points redeemed — {{org.name}}",
      body: `<p>Dear {{patient.name}},</p>
<p>We confirm that loyalty points from your account at <strong>{{org.name}}</strong> have been successfully redeemed.</p>
<p>Log in to the patient portal to check your current points balance.</p>
<p>Thank you for using our loyalty program!<br>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "loyalty_tier_upgrade",
    category: "loyalty",
    module: "gabinet",
    eventType: "loyalty_tier_upgrade",
    requiredSources: ["patient", "org"],
    pl: {
      name: "Awans na wyższy poziom lojalnościowy",
      subject: "Awansowałeś na nowy poziom lojalnościowy! 🏆 — {{org.name}}",
      body: `<p>Drogi/a {{patient.name}},</p>
<p>Gratulujemy! Dzięki swojej lojalności awansowałeś/aś na wyższy poziom w programie lojalnościowym <strong>{{org.name}}</strong>! 🎉</p>
<p>Twój nowy poziom otwiera przed Tobą dodatkowe korzyści i przywileje. Zaloguj się do portalu pacjenta, aby zobaczyć pełną listę benefitów.</p>
<p>Dziękujemy za zaufanie!<br>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Loyalty Tier Upgrade",
      subject: "You've been upgraded to a new loyalty tier! 🏆 — {{org.name}}",
      body: `<p>Dear {{patient.name}},</p>
<p>Congratulations! Thanks to your loyalty, you've been upgraded to a higher tier in the <strong>{{org.name}}</strong> loyalty program! 🎉</p>
<p>Your new tier comes with additional benefits and privileges. Log in to the patient portal to see the full list of perks.</p>
<p>Thank you for your trust!<br>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "loyalty_tier_downgrade",
    category: "loyalty",
    module: "gabinet",
    eventType: "loyalty_tier_downgrade",
    requiredSources: ["patient", "org"],
    pl: {
      name: "Zmiana poziomu lojalnościowego",
      subject: "Zmiana poziomu w programie lojalnościowym — {{org.name}}",
      body: `<p>Drogi/a {{patient.name}},</p>
<p>Informujemy, że Twój poziom w programie lojalnościowym <strong>{{org.name}}</strong> uległ zmianie ze względu na brak aktywności w ostatnim okresie.</p>
<p>Zaloguj się do portalu pacjenta, aby sprawdzić aktualny poziom i warunki programu. Chętnie pomożemy Ci odzyskać wyższy status.</p>
<p>Liczymy na ponowne spotkanie!<br>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Loyalty Tier Downgrade",
      subject: "Loyalty program tier change — {{org.name}}",
      body: `<p>Dear {{patient.name}},</p>
<p>We'd like to inform you that your tier in the <strong>{{org.name}}</strong> loyalty program has changed due to inactivity in the recent period.</p>
<p>Log in to the patient portal to see your current tier and program terms. We'd love to help you regain a higher status.</p>
<p>We look forward to seeing you again!<br>The {{org.name}} Team</p>`,
    },
  },
  {
    slug: "loyalty_birthday_bonus",
    category: "loyalty",
    module: "gabinet",
    eventType: "loyalty_birthday_bonus",
    requiredSources: ["patient", "org"],
    pl: {
      name: "Bonus urodzinowy — program lojalnościowy",
      subject: "Urodzinowy bonus lojalnościowy dla Ciebie! 🎁 — {{org.name}}",
      body: `<p>Drogi/a {{patient.name}},</p>
<p>Z okazji Twoich urodzin cały zespół <strong>{{org.name}}</strong> przygotował dla Ciebie wyjątkowy bonus lojalnościowy! 🎂🎉</p>
<p>Dodatkowe punkty zostały naliczone do Twojego konta i możesz je wykorzystać podczas kolejnej wizyty.</p>
<p>Zaloguj się do portalu pacjenta, aby sprawdzić saldo i skorzystać z bonusu.</p>
<p>Wszystkiego najlepszego!<br>Zespół {{org.name}}</p>`,
    },
    en: {
      name: "Loyalty Birthday Bonus",
      subject: "A birthday loyalty bonus just for you! 🎁 — {{org.name}}",
      body: `<p>Dear {{patient.name}},</p>
<p>To celebrate your birthday, the entire team at <strong>{{org.name}}</strong> has prepared a special loyalty bonus for you! 🎂🎉</p>
<p>Bonus points have been added to your account and can be used during your next visit.</p>
<p>Log in to the patient portal to check your balance and use your bonus.</p>
<p>Happy Birthday!<br>The {{org.name}} Team</p>`,
    },
  },
];

// ---------------------------------------------------------------------------
// Combined catalog
// ---------------------------------------------------------------------------

export const SYSTEM_TEMPLATES: SystemTemplateDef[] = [
  ...PLATFORM_TEMPLATES,
  ...CRM_SALES_TEMPLATES,
  ...CRM_ACTIVITIES_TEMPLATES,
  ...CRM_DOCUMENTS_TEMPLATES,
  ...CRM_PIPELINE_TEMPLATES,
  ...GABINET_APPOINTMENTS_TEMPLATES,
  ...GABINET_PATIENTS_TEMPLATES,
  ...GABINET_TREATMENTS_TEMPLATES,
  ...GABINET_STAFF_TEMPLATES,
  ...GABINET_LOYALTY_TEMPLATES,
];

// ---------------------------------------------------------------------------
// Batch seeding
// ---------------------------------------------------------------------------

const BATCH_SIZE = 15;

export const seedBatch = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    createdBy: v.id("users"),
    startIndex: v.number(),
    batchSize: v.number(),
  },
  handler: async (ctx, args) => {
    const batch = SYSTEM_TEMPLATES.slice(
      args.startIndex,
      args.startIndex + args.batchSize,
    );
    const now = Date.now();

    for (const tmpl of batch) {
      for (const locale of ["pl", "en"] as const) {
        const existing = await ctx.db
          .query("emailTemplates")
          .withIndex("by_org_slug_locale", (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("slug", tmpl.slug)
              .eq("locale", locale),
          )
          .first();

        if (existing) continue;

        const content = tmpl[locale];

        await ctx.db.insert("emailTemplates", {
          organizationId: args.organizationId,
          name: content.name,
          subject: content.subject,
          body: content.body,
          renderedHtml: content.body,
          slug: tmpl.slug,
          category: tmpl.category,
          module: tmpl.module,
          eventType: tmpl.eventType,
          isSystem: true,
          locale,
          requiredSources: tmpl.requiredSources,
          variables: [],
          createdBy: args.createdBy,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  },
});

export const seedAllSystemTemplates = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    createdBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    for (let i = 0; i < SYSTEM_TEMPLATES.length; i += BATCH_SIZE) {
      await ctx.scheduler.runAfter(
        0,
        internal.emailTemplateSeed.seedBatch,
        {
          organizationId: args.organizationId,
          createdBy: args.createdBy,
          startIndex: i,
          batchSize: BATCH_SIZE,
        },
      );
    }
  },
});
