from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer


ROOT = Path("/Users/hakimo/Documents/Projects/production-line")
OUTPUT = ROOT / "output" / "pdf" / "app-summary-one-pager.pdf"


def bullet_paragraphs(items, style):
    return [Paragraph(item, style, bulletText="•") for item in items]


def build_pdf():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=letter,
        leftMargin=0.58 * inch,
        rightMargin=0.58 * inch,
        topMargin=0.5 * inch,
        bottomMargin=0.45 * inch,
        title="Production Line App Summary",
        author="Codex",
    )

    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="TitleCompact",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=18,
            leading=22,
            textColor=colors.HexColor("#12263A"),
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Meta",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=10.5,
            textColor=colors.HexColor("#4B5B6A"),
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Section",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=10.2,
            leading=12,
            textColor=colors.HexColor("#8F2424"),
            spaceBefore=4,
            spaceAfter=3,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BodyCompact",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=8.6,
            leading=10.6,
            textColor=colors.HexColor("#1F2D3A"),
            spaceAfter=3,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BulletCompact",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=8.45,
            leading=10.15,
            textColor=colors.HexColor("#1F2D3A"),
            spaceAfter=1.3,
            leftIndent=10,
            firstLineIndent=-8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Footer",
            parent=styles["BodyText"],
            fontName="Helvetica-Oblique",
            fontSize=7.2,
            leading=9,
            textColor=colors.HexColor("#5D6B78"),
            spaceBefore=5,
        )
    )

    feature_items = [
        "Email/password authentication with Firebase Auth and route protection.",
        "Dynamic RBAC with default and custom roles, permission guards, and admin controls.",
        "Production operations across products, lines, plans, work orders, scanners, and daily reports.",
        "Role-based dashboards, KPIs, charts, printing, image/PDF export, and sharing workflows.",
        "HR workflows including attendance, leave, loans, payroll, approvals, and employee self-service.",
        "Inventory, costs, quality, repair, and system administration modules in the same app shell.",
        "Realtime updates, notifications, activity logging, and offline Firestore cache support.",
    ]

    how_it_works_items = [
        "<b>Frontend shell:</b> React 19 + Vite app with BrowserRouter in <font name='Courier'>App.tsx</font>; protected routes aggregate module route sets for dashboards, production, HR, costs, system, inventory, repair, online, and catalog areas.",
        "<b>Application layer:</b> Zustand store in <font name='Courier'>store/useAppStore.ts</font> orchestrates auth, permissions, subscriptions, notifications, and cross-module data loading.",
        "<b>Domain modules:</b> Feature code is organized under <font name='Courier'>modules/&lt;domain&gt;</font> for production, HR, inventory, quality, costs, repair, system, dashboards, and more.",
        "<b>Services/data access:</b> Repo architecture docs define the flow as UI -&gt; store/use case -&gt; services -&gt; Firebase; service files wrap Firestore, Storage, and callable Functions access.",
        "<b>Platform services:</b> Firebase config in <font name='Courier'>modules/auth/services/firebase.ts</font> initializes Auth, Firestore with persistent local cache, Storage, and callable Functions (<font name='Courier'>us-central1</font>).",
        "<b>Event flow:</b> Shared event bus in <font name='Courier'>shared/events/event-bus.ts</font> lets modules emit and react to system events without blocking callers.",
    ]

    getting_started_items = [
        "Install dependencies: <font name='Courier'>npm install</font>",
        "Create <font name='Courier'>.env.local</font> with the required <font name='Courier'>VITE_FIREBASE_*</font> values listed in <font name='Courier'>README.md</font>.",
        "Run the app: <font name='Courier'>npm run dev</font> (Vite dev server is configured for port 3000).",
        "Optional for deployment/runtime parity: build Functions with <font name='Courier'>npm --prefix functions run build</font>.",
    ]

    story = [
        Paragraph("HAKIMO Production Line App", styles["TitleCompact"]),
        Paragraph(
            "Repo-based one-page summary generated from README, PROJECT_DOC, App.tsx, architecture docs, package.json, and Firebase setup files.",
            styles["Meta"],
        ),
        HRFlowable(width="100%", thickness=0.7, color=colors.HexColor("#C8D2DC")),
        Spacer(1, 6),
        Paragraph("What It Is", styles["Section"]),
        Paragraph(
            "An internal ERP-style web application for managing factory production operations, reporting, HR workflows, approvals, inventory, costs, and system administration. The repo shows a modular React 19 + TypeScript frontend backed by Firebase services and Zustand-based application orchestration.",
            styles["BodyCompact"],
        ),
        Paragraph("Who It's For", styles["Section"]),
        Paragraph(
            "Primary persona: a factory production supervisor or operations administrator who needs to monitor lines, capture daily production activity, and work inside a permission-controlled system. Adjacent personas in the repo include HR staff, system admins, quality users, inventory users, and repair teams.",
            styles["BodyCompact"],
        ),
        Paragraph("What It Does", styles["Section"]),
        *bullet_paragraphs(feature_items, styles["BulletCompact"]),
        Paragraph("How It Works", styles["Section"]),
        *bullet_paragraphs(how_it_works_items, styles["BulletCompact"]),
        Paragraph("How To Run", styles["Section"]),
        *bullet_paragraphs(getting_started_items, styles["BulletCompact"]),
        Paragraph(
            "Not found in repo: explicit SLA, hosting URL for this exact environment, database schema diagram, or a dedicated end-user product positioning page.",
            styles["Footer"],
        ),
    ]

    doc.build(story)
    return OUTPUT


if __name__ == "__main__":
    path = build_pdf()
    print(path)
