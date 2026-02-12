import { useEffect } from "react";
import { Link } from "react-router-dom";

function PolicySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <div className="space-y-3 text-sm leading-7 text-white/80">{children}</div>
    </section>
  );
}

export function PrivacyPage() {
  useEffect(() => {
    document.title = "Privacy Policy | PointFinder";
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  return (
    <main className="min-h-screen bg-[#060b06] text-white">
      <div className="mx-auto w-full max-w-4xl px-6 py-12 md:py-16">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link
            to="/"
            className="text-sm text-green-400/80 transition-colors hover:text-green-300"
          >
            {"<-"} Back to Home
          </Link>
          <span className="text-xs uppercase tracking-[0.14em] text-white/40">
            Last updated: February 11, 2026
          </span>
        </div>

        <header className="mb-10 space-y-4">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Privacy Policy
          </h1>
          <p className="max-w-3xl text-sm leading-7 text-white/75">
            This Privacy Policy explains how PointFinder ("we", "us", "our")
            handles personal data across the PointFinder iOS app, Android app,
            and web admin available at desbravadores.dev.
          </p>
          <p className="max-w-3xl text-sm leading-7 text-white/75">
            The platform is designed for organized scouting and Pathfinder
            activities. Depending on your role, you may use PointFinder as a
            player, organizer, or operator.
          </p>
        </header>

        <div className="space-y-9">
          <PolicySection title="1. Data We Process">
            <p>
              We process the minimum data needed to run games, authenticate
              users, and monitor event progress.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Account data (operators/admins):</strong> name, email
                address, password hash, role, and refresh-token records.
              </li>
              <li>
                <strong>Player profile data:</strong> display name, device ID,
                team and game membership, and player access token.
              </li>
              <li>
                <strong>Gameplay data:</strong> check-ins, challenge
                submissions (text and optional photo), review status, feedback,
                points, and activity events.
              </li>
              <li>
                <strong>Location data:</strong> team latitude/longitude updates
                for live map monitoring during active missions.
              </li>
              <li>
                <strong>Push data:</strong> push notification token and platform
                (iOS or Android) for game notifications.
              </li>
              <li>
                <strong>Session and local cache data:</strong> authentication and
                session records in browser or device storage, plus offline queue
                and cached game state for connectivity recovery.
              </li>
            </ul>
          </PolicySection>

          <PolicySection title="2. How We Collect Data">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Directly from users</strong> when operators register or
                log in, and when players join with a join code/QR code.
              </li>
              <li>
                <strong>From gameplay actions</strong> such as NFC check-ins,
                submissions, and operator review workflows.
              </li>
              <li>
                <strong>From device features</strong> when permissions are
                granted (camera, NFC, notifications, location, photo library).
              </li>
            </ul>
            <p>
              Both iOS and Android clients send periodic location updates
              during active player sessions (approximately every 30 seconds),
              as well as immediate updates after key actions such as check-ins
              and submissions. Location data is used solely for real-time
              mission monitoring by authorized operators.
            </p>
          </PolicySection>

          <PolicySection title="3. Why We Use Data">
            <ul className="list-disc space-y-2 pl-5">
              <li>Authenticate players and operators securely.</li>
              <li>Run game mechanics (check-ins, challenge solving, scoring).</li>
              <li>Provide real-time monitoring for authorized operators.</li>
              <li>
                Deliver game notifications and event communications (push/email).
              </li>
              <li>
                Support offline-first synchronization when connectivity returns.
              </li>
              <li>
                Protect platform integrity, prevent abuse, and troubleshoot
                operational issues.
              </li>
            </ul>
          </PolicySection>

          <PolicySection title="4. Data Sharing and Processors">
            <p>
              We do not sell personal data. We share data only when required to
              operate platform features:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Push providers:</strong> Apple Push Notification service
                (APNs) and Firebase Cloud Messaging (FCM).
              </li>
              <li>
                <strong>Email delivery:</strong> SMTP email provider configured
                for operator invites and notifications.
              </li>
              <li>
                <strong>Map tiles and assets:</strong> OpenStreetMap tiles and
                Google Fonts in the web admin.
              </li>
              <li>
                <strong>Infrastructure providers:</strong> hosting, networking,
                and storage needed to run the service.
              </li>
            </ul>
          </PolicySection>

          <PolicySection title="5. Security Measures">
            <ul className="list-disc space-y-2 pl-5">
              <li>TLS (HTTPS) in production transport.</li>
              <li>Password hashing using BCrypt.</li>
              <li>JWT-based authentication and role-based authorization.</li>
              <li>Refresh-token flow for operator sessions.</li>
              <li>
                Mobile token storage in Keychain (iOS) and encrypted shared
                preferences (Android).
              </li>
            </ul>
            <p>
              No internet-connected system is 100% secure. We continue to
              improve technical and organizational safeguards.
            </p>
          </PolicySection>

          <PolicySection title="6. Retention and Deletion">
            <p>
              We keep data for as long as it is needed for active games and
              operational records.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Deleting a game removes related records in the primary
                relational database (teams, players, submissions, check-ins,
                locations, and activity events) through cascading relationships.
              </li>
              <li>
                Some operational artifacts (for example uploaded files, token
                rows, and logs) can persist until cleanup routines or manual
                deletion are performed.
              </li>
              <li>
                Offline and cache data may remain on user devices until logout
                or local app data cleanup.
              </li>
            </ul>
          </PolicySection>

          <PolicySection title="7. Your Rights and Choices">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                You can stop using the app at any time and remove it from your
                device.
              </li>
              <li>
                You can manage app permissions (location, camera, notifications,
                photo access, NFC) in device settings.
              </li>
              <li>
                For data access, correction, or deletion requests, contact your
                game organizer and/or platform support.
              </li>
            </ul>
            <p>
              Contact email for privacy requests:{" "}
              <a
                className="text-green-300 underline underline-offset-4"
                href="mailto:info@desbravadores.dev"
              >
                info@desbravadores.dev
              </a>
            </p>
          </PolicySection>

          <PolicySection title="8. Children's Data">
            <p>
              PointFinder is designed for organized youth activities supervised
              by responsible adults. Event organizers are responsible for
              obtaining all necessary participant permissions and parental
              consents required by local law.
            </p>
          </PolicySection>

          <PolicySection title="9. Policy Updates">
            <p>
              We may update this Privacy Policy as the platform evolves or legal
              requirements change. The "Last updated" date at the top reflects
              the latest revision.
            </p>
          </PolicySection>
        </div>
      </div>
    </main>
  );
}
