# App-Katalog Roadmap — 50 geplante Apps

Kandidaten für zukünftige Aufnahme in den GMZ Cloud Business Apps Katalog.  
Kriterien: Self-hosted, Docker-kompatibel, sinnvoll für KMU-Mandanten, wartbar.

---

## Inhaltsverzeichnis

- [Kommunikation & Kollaboration](#kommunikation--kollaboration)
- [Projektmanagement & Aufgaben](#projektmanagement--aufgaben)
- [CRM & Vertrieb](#crm--vertrieb)
- [ERP & Buchhaltung](#erp--buchhaltung)
- [DevOps & Entwickler-Tools](#devops--entwickler-tools)
- [Monitoring & Observability](#monitoring--observability)
- [Sicherheit & Netzwerk](#sicherheit--netzwerk)
- [Medien & Content](#medien--content)
- [HR & Mitarbeiterverwaltung](#hr--mitarbeiterverwaltung)
- [Daten & Analytics](#daten--analytics)

---

## Kommunikation & Kollaboration

### 1. Mattermost
**Kategorie:** communication  
**Beschreibung:** Open-Source-Alternative zu Slack mit Channels, Threads, Webhooks und vollständiger API. Ideal für interne Teamkommunikation ohne Cloud-Abhängigkeit. Unterstützt LDAP/SAML SSO via Authentik.  
**Image:** `mattermost/mattermost-team-edition`  
**Besonderheiten:** Team Edition kostenlos, Enterprise für Compliance-Features. Starke Integration mit GitLab, Jira, Prometheus-Alerts.

---

### 2. Rocket.Chat
**Kategorie:** communication  
**Beschreibung:** Feature-reicher Team-Chat mit Omnichannel-Support (Live-Chat, E-Mail, WhatsApp in einer Oberfläche). Gut geeignet für Unternehmen mit Kundenkontakt. Bietet Marketplace für Erweiterungen.  
**Image:** `rocketchat/rocket.chat`  
**Besonderheiten:** Omnichannel unterscheidet Rocket.Chat von Mattermost. Hoher RAM-Bedarf (~2 GB), MongoDB als Backend.

---

### 3. Matrix Synapse + Element
**Kategorie:** communication  
**Beschreibung:** Föderiertes, Ende-zu-Ende-verschlüsseltes Messaging-Protokoll mit Element als Web-Client. Der einzige wirklich dezentralisierbare Chat-Stack. Besonders für sicherheitssensible Branchen interessant.  
**Image:** `matrixdotorg/synapse`, `vectorim/element-web`  
**Besonderheiten:** Zwei-Container-Deploy (Synapse + Element). Federation optional deaktivierbar für rein-interne Nutzung.

---

### 4. Listmonk
**Kategorie:** communication  
**Beschreibung:** High-Performance Newsletter- und Mailing-Listen-Server mit eigenem SMTP-Versand. Verwaltet Subscriber-Listen, Segmentierung, Templates und Kampagnen. Datenschutzkonform da vollständig self-hosted.  
**Image:** `listmonk/listmonk`  
**Besonderheiten:** Extrem ressourcenschonend (Go-Binary), PostgreSQL-Backend. Kein Tracking ohne explizite Konfiguration.

---

### 5. Zulip
**Kategorie:** communication  
**Beschreibung:** Chat-Plattform mit einzigartigem Thread-Modell: Streams + Topics statt flache Channels. Macht asynchrone Kommunikation in größeren Teams deutlich effizienter. LDAP/SAML-Integration vorhanden.  
**Image:** `zulip/docker-zulip`  
**Besonderheiten:** Einzigartiges UX-Konzept. Selbst große Open-Source-Projekte (Python, Rust) nutzen Zulip.

---

## Projektmanagement & Aufgaben

### 6. Plane
**Kategorie:** project-management  
**Beschreibung:** Open-Source-Alternative zu Jira und Linear mit Issues, Cycles (Sprints), Modules und Analytics. Moderne UI, aktive Entwicklung. Gut für agile Teams geeignet.  
**Image:** `makeplane/plane-frontend`, `makeplane/plane-backend`  
**Besonderheiten:** Multi-Container (Frontend, Backend, Worker, Beat). Noch recht jung, aber rapide wachsende Community.

---

### 7. Vikunja
**Kategorie:** project-management  
**Beschreibung:** Aufgabenverwaltung mit To-Do-Listen, Kanban-Boards, Gantt-Diagrammen und Team-Funktionen. Leichtgewichtige Todoist/Trello-Alternative. Sehr einfach zu deployen.  
**Image:** `vikunja/vikunja`  
**Besonderheiten:** Single-Container-Deploy möglich. Unterstützt CalDAV für Kalender-Integration.

---

### 8. Taiga
**Kategorie:** project-management  
**Beschreibung:** Agiles Projektmanagement mit Scrum, Kanban und klassischem Projektmanagement in einer Plattform. Open-Source mit optionalem kommerziellen Cloud-Angebot. REST-API vollständig.  
**Image:** `taigaio/taiga-back`, `taigaio/taiga-front`  
**Besonderheiten:** Komplexer Multi-Container-Stack. Gut geeignet für Agenturen und Softwareteams.

---

### 9. Focalboard (Mattermost Boards)
**Kategorie:** project-management  
**Beschreibung:** Kanban- und Board-Tool als Standalone-App oder Mattermost-Plugin. Trello-Alternative mit einfachem Datenmodell. Gut für kleine Teams ohne komplexen Prozess.  
**Image:** `mattermost/focalboard`  
**Besonderheiten:** Kann als eigenständige App oder integriert in Mattermost laufen.

---

### 10. Leantime
**Kategorie:** project-management  
**Beschreibung:** Projektmanagement speziell für ADHS-freundliche UX — fokussierte Ansichten, Zeiterfassung, Retros. Enthält OKR-Tracking, Ideenboard und Canvas-Templates. Für kleinere Teams ideal.  
**Image:** `leantime/leantime`  
**Besonderheiten:** Einzigartige Zielgruppe. MariaDB-Backend, einfacher Deploy.

---

## CRM & Vertrieb

### 11. Twenty CRM
**Kategorie:** crm  
**Beschreibung:** Modernes Open-Source-CRM mit Salesforce-ähnlichem Datenmodell und sauberem UI. Kontakte, Companies, Opportunities, Activities und vollständige API. Aktiv entwickelt seit 2023.  
**Image:** `twentycrm/twenty`  
**Besonderheiten:** GraphQL-API, React-Frontend. Einer der vielversprechendsten neuen Open-Source-CRM-Stacks.

---

### 12. Monica CRM
**Kategorie:** crm  
**Beschreibung:** Personal Relationship Manager — verwaltet Kontakte, Interaktionen, Geburtstage, Notizen zu Personen. Stärker auf Beziehungsmanagement als auf Verkaufsprozesse ausgerichtet.  
**Image:** `monicahq/monicahq`  
**Besonderheiten:** Eher für kleine Teams / Soloselbstständige. MySQL-Backend. Sehr gute UX.

---

### 13. EspoCRM
**Kategorie:** crm  
**Beschreibung:** Vollwertiges CRM mit Leads, Accounts, Contacts, Opportunities, Cases, Kampagnen und E-Mail-Integration. REST-API, Workflows, Custom Fields. PHP-basiert, leicht zu anpassen.  
**Image:** `espocrm/espocrm`  
**Besonderheiten:** MariaDB-Backend. Guter Mittelweg zwischen Einfachheit und Funktionsumfang.

---

### 14. Odoo Community
**Kategorie:** crm  
**Beschreibung:** Modulares Open-Source-ERP/CRM mit CRM, Verkauf, Einkauf, Inventar, Buchhaltung, HR und Projektmanagement. Die Community Edition ist kostenlos, sehr umfangreich aber ressourcenintensiv.  
**Image:** `odoo:17`  
**Besonderheiten:** PostgreSQL-Backend. Hoher RAM-Bedarf (min. 4 GB). Sehr hoher Funktionsumfang, aber steile Lernkurve.

---

### 15. Krayin CRM
**Kategorie:** crm  
**Beschreibung:** Laravel-basiertes Open-Source-CRM mit modernem UI, Leads, Contacts, Opportunities, Quotes und E-Mail-Templates. Leichter als Odoo, stärker als Monica.  
**Image:** `krayin/laravel-crm`  
**Besonderheiten:** MySQL-Backend. Aktive Entwicklung, gute API.

---

## ERP & Buchhaltung

### 16. InvoiceNinja
**Kategorie:** finance  
**Beschreibung:** Rechnungs- und Angebotssoftware mit Zeiterfassung, Projekten, Ausgaben und Zahlungsintegration (Stripe, PayPal). Die bekannteste selbst gehostete Rechnungsstellung für Freelancer und KMU.  
**Image:** `invoiceninja/invoiceninja`  
**Besonderheiten:** MySQL-Backend. v5 (aktuelle Version) komplett in Flutter/Dart. Sehr gute Mobile-App.

---

### 17. Crater
**Kategorie:** finance  
**Beschreibung:** Einfache Rechnungs- und Ausgabenverwaltung für Freelancer und kleine Unternehmen. Laravel-Backend, Vue.js-Frontend. Weniger komplex als InvoiceNinja, dafür schneller eingerichtet.  
**Image:** `craterapp/crater`  
**Besonderheiten:** MySQL-Backend. Gute Alternative wenn InvoiceNinja zu umfangreich ist.

---

### 18. Akaunting
**Kategorie:** finance  
**Beschreibung:** Open-Source-Buchhaltungssoftware mit doppelter Buchführung, Rechnungen, Ausgaben, Banktransaktionen und Reports. App-Store für Erweiterungen (Payroll, Tax etc.).  
**Image:** `akaunting/akaunting`  
**Besonderheiten:** MySQL-Backend. Erste Wahl wenn echte Buchhaltung (nicht nur Rechnungsstellung) benötigt wird.

---

### 19. Firefly III
**Kategorie:** finance  
**Beschreibung:** Persönliche und geschäftliche Finanzverwaltung mit doppelter Buchführung, Budgets, Kategorien, Regeln und Import aus Banken (CSV/OFX). Ideal für interne Kostenstellen-Übersicht.  
**Image:** `fireflyiii/core`  
**Besonderheiten:** PostgreSQL oder MySQL. Data Importer als separater Container für automatische Bank-Imports.

---

### 20. ERPNext
**Kategorie:** erp  
**Beschreibung:** Vollständiges Open-Source-ERP (Frappe Framework) mit Buchhaltung, Inventar, HR, Payroll, CRM, Produktion und Projektverwaltung. Eines der umfangreichsten Open-Source-ERP-Systeme überhaupt.  
**Image:** `frappe/erpnext`  
**Besonderheiten:** Sehr ressourcenintensiv (min. 8 GB RAM empfohlen). Multi-Container-Stack. Für produzierendes Gewerbe und Handel besonders geeignet.

---

## DevOps & Entwickler-Tools

### 21. Gitea
**Kategorie:** developer-tools  
**Beschreibung:** Leichtgewichtiger self-hosted Git-Service mit Issues, Pull Requests, CI/CD-Actions und Package Registry. Die schlanke Alternative zu GitLab. Sehr ressourcenschonend (Go-Binary).  
**Image:** `gitea/gitea`  
**Besonderheiten:** SQLite oder PostgreSQL. Gitea Actions sind GitHub-Actions-kompatibel.

---

### 22. Forgejo
**Kategorie:** developer-tools  
**Beschreibung:** Community-Fork von Gitea mit stärkerer Open-Source-Governance. API-kompatibel zu Gitea und GitHub. Aktiv gewartet, keine proprietären Abhängigkeiten.  
**Image:** `codeberg.org/forgejo/forgejo`  
**Besonderheiten:** Empfehlung wenn Gitea-Fork mit Community-Fokus gewünscht wird.

---

### 23. GitLab Community Edition
**Kategorie:** developer-tools  
**Beschreibung:** Vollständige DevOps-Plattform mit Git, CI/CD, Container Registry, SAST, DAST, Feature Flags und Kubernetes-Integration. Sehr umfangreich, ressourcenintensiv.  
**Image:** `gitlab/gitlab-ce`  
**Besonderheiten:** Min. 8 GB RAM. Für Teams die alles in einer Plattform wollen.

---

### 24. Drone CI
**Kategorie:** developer-tools  
**Beschreibung:** Container-native CI/CD-Pipeline mit einfacher YAML-Konfiguration. Sehr schnell und ressourcenschonend. Integriert mit Gitea, GitHub, GitLab.  
**Image:** `drone/drone`  
**Besonderheiten:** Gute Ergänzung zu Gitea wenn kein GitLab gewünscht wird.

---

### 25. Portainer
**Kategorie:** developer-tools  
**Beschreibung:** Web-UI zur Verwaltung von Docker-Containern, Compose-Stacks, Images und Netzwerken. Ideal als Self-Service-Portal für Tenants die Container direkt verwalten möchten.  
**Image:** `portainer/portainer-ce`  
**Besonderheiten:** Community Edition kostenlos. Kann Docker Socket oder Portainer Agent nutzen.

---

### 26. Harbor
**Kategorie:** developer-tools  
**Beschreibung:** Enterprise Container Registry mit Vulnerability Scanning, RBAC, Content Trust und Replikation. Alternative zu Docker Hub für interne Images.  
**Image:** `goharbor/harbor-core`  
**Besonderheiten:** Multi-Container-Stack. Trivy-Integration für Image-Scanning.

---

### 27. Verdaccio
**Kategorie:** developer-tools  
**Beschreibung:** Privater npm/yarn/pnpm Package Registry. Cached öffentliche Pakete lokal und erlaubt das Publishing privater Pakete. Sehr einfach zu betreiben.  
**Image:** `verdaccio/verdaccio`  
**Besonderheiten:** Single-Container. Ideal für Teams mit internen npm-Paketen.

---

### 28. Nexus Repository
**Kategorie:** developer-tools  
**Beschreibung:** Universal Artifact Repository für npm, Maven, Docker, PyPI, NuGet und mehr. Die umfangreichste Open-Source-Lösung für Artefakt-Management.  
**Image:** `sonatype/nexus3`  
**Besonderheiten:** Hoher RAM-Bedarf (~2-4 GB). Sonatype OSS Version kostenlos.

---

## Monitoring & Observability

### 29. Uptime Kuma
**Kategorie:** monitoring  
**Beschreibung:** Self-hosted Status-Page und Uptime-Monitor mit HTTP, TCP, DNS, SSL-Zertifikat-Überwachung. Benachrichtigungen via Telegram, Teams, Slack, E-Mail. Sehr einfach zu bedienen.  
**Image:** `louislam/uptime-kuma`  
**Besonderheiten:** Single-Container, SQLite. Perfekte Ergänzung zum Prometheus/Grafana-Stack für externe Endpoint-Überwachung.

---

### 30. Netdata
**Kategorie:** monitoring  
**Beschreibung:** Echtzeit-Performance-Monitoring mit sehr detaillierten System-Metriken und automatischer Anomalie-Erkennung. Niedrige Ressourcennutzung, einfache Installation.  
**Image:** `netdata/netdata`  
**Besonderheiten:** Benötigt privilegierten Zugriff auf Host-Metriken. Gut als schnelle Diagnose-Ergänzung zu Prometheus.

---

### 31. Zabbix
**Kategorie:** monitoring  
**Beschreibung:** Enterprise-Monitoring-Plattform mit Agenten, SNMP, JMX, IPMI, und umfangreichen Alert-Funktionen. Sehr etabliert in Enterprise-Umgebungen, besonders für Netzwerk-Infrastruktur.  
**Image:** `zabbix/zabbix-server-pgsql`  
**Besonderheiten:** Multi-Container (Server, Web, Agent). PostgreSQL-Backend. Komplexer als Prometheus, aber mächtiger für klassische IT-Infrastruktur.

---

### 32. OpenObserve
**Kategorie:** monitoring  
**Beschreibung:** Log, Metric und Trace Platform als Alternative zu Elasticsearch/OpenSearch. Deutlich ressourcenschonender (Go-basiert), Rust-Storage-Backend. OTEL-kompatibel.  
**Image:** `public.ecr.aws/zinclabs/openobserve`  
**Besonderheiten:** Single-Binary-Deploy möglich. Gute Alternative wenn Loki zu simpel und Elasticsearch zu teuer ist.

---

## Sicherheit & Netzwerk

### 33. Wazuh
**Kategorie:** security  
**Beschreibung:** Open-Source SIEM und XDR mit Host-Intrusion Detection, Vulnerability Assessment, Compliance-Reporting (PCI-DSS, HIPAA, GDPR) und File Integrity Monitoring.  
**Image:** `wazuh/wazuh-manager`  
**Besonderheiten:** Multi-Container (Manager, Indexer, Dashboard). Min. 8 GB RAM. Für Tenants mit Compliance-Anforderungen.

---

### 34. CrowdSec
**Kategorie:** security  
**Beschreibung:** Kollaborative IP-Reputation und Intrusion Prevention. Analysiert Logs, blockiert bekannte Angreifer und teilt Threat Intelligence mit der Community. Traefik-Bouncer verfügbar.  
**Image:** `crowdsecurity/crowdsec`  
**Besonderheiten:** Traefik-Bouncer direkt integrierbar. Kostenlos für self-hosted, Cloud-Konsole optional.

---

### 35. Netbird
**Kategorie:** networking  
**Beschreibung:** WireGuard-basiertes Zero-Trust-Netzwerk. Verbindet VMs, Server und Endgeräte ohne Port-Öffnungen oder VPN-Gateways. Self-hosted Management-Plane verfügbar.  
**Image:** `netbirdio/management`  
**Besonderheiten:** Alternative zu Tailscale für vollständig self-hosted Zero-Trust-Netzwerke.

---

### 36. Headscale
**Kategorie:** networking  
**Beschreibung:** Self-hosted Tailscale Control Server. Ermöglicht vollständig selbst gehostetes WireGuard-Mesh-Netzwerk ohne Tailscale-Cloud-Abhängigkeit.  
**Image:** `headscale/headscale`  
**Besonderheiten:** Benötigt Tailscale-Clients (kostenlos). Sehr einfaches Single-Binary-Deploy.

---

### 37. AdGuard Home
**Kategorie:** networking  
**Beschreibung:** DNS-Sinkhole und Werbeblocker für das gesamte Netzwerk. Blockiert Werbung, Tracker und Malware-Domains auf DNS-Ebene. Ersetzt Pi-hole mit modernerem UI.  
**Image:** `adguard/adguardhome`  
**Besonderheiten:** Kann DoH/DoT als Upstream-DNS verwenden. Gut für isolierte Tenant-Netzwerke.

---

### 38. Smallstep Step-CA
**Kategorie:** security  
**Beschreibung:** Private Certificate Authority mit ACME-Support, OIDC-Authentifizierung und automatischer Zertifikatserneuerung. Interne TLS-Zertifikate für Microservices und interne Dienste.  
**Image:** `smallstep/step-ca`  
**Besonderheiten:** ACME-kompatibel (Traefik kann Step-CA als Certresolver nutzen). Ideal für interne mTLS.

---

## Medien & Content

### 39. Immich
**Kategorie:** media  
**Beschreibung:** Self-hosted Google Photos Alternative mit ML-basierter Gesichtserkennung, Objekterkennung, Karten-View und automatischer Backup-App für iOS/Android.  
**Image:** `ghcr.io/immich-app/immich-server`  
**Besonderheiten:** Multi-Container (Server, ML, Redis, PostgreSQL+pgvector). Min. 4 GB RAM. Sehr aktive Entwicklung.

---

### 40. Jellyfin
**Kategorie:** media  
**Beschreibung:** Open-Source Media-Server für Videos, Musik, Bücher und Fotos. Plex-Alternative ohne Tracking oder zwingenden Account. Hardware-Transcoding via Intel QSV/NVENC.  
**Image:** `jellyfin/jellyfin`  
**Besonderheiten:** Optional LDAP-Plugin für SSO. Gut für Unternehmen die interne Video-Bibliotheken hosten.

---

### 41. Tube Archivist
**Kategorie:** media  
**Beschreibung:** YouTube-Archiv-Tool das Channels und Playlists herunterlädt, indexiert und mit eigenem Player durchsuchbar macht. Elasticsearch-Backend.  
**Image:** `bbilly1/tubearchivist`  
**Besonderheiten:** Elasticsearch-Backend (ressourcenintensiv). Gut für Wissensmanagement wenn YouTube-Inhalte intern archiviert werden sollen.

---

### 42. Calibre-Web
**Kategorie:** documents  
**Beschreibung:** Web-Frontend für Calibre-Bibliotheken. Verwaltet E-Books, ermöglicht OPDS-Feeds und Kindle-Send-Funktion. Für Unternehmen mit großen Fachbibliotheken.  
**Image:** `linuxserver/calibre-web`  
**Besonderheiten:** Benötigt Calibre-Bibliothek als Volume. Kobo/Kindle-Integration möglich.

---

## HR & Mitarbeiterverwaltung

### 43. OrangeHRM
**Kategorie:** hr  
**Beschreibung:** Open-Source HR-Management mit Mitarbeiterdaten, Urlaub, Zeiterfassung, Recruitment und Performance-Management. Weit verbreitete Lösung für KMU.  
**Image:** `orangehrm/orangehrm`  
**Besonderheiten:** MySQL-Backend. Community Edition kostenlos, Enterprise für LDAP/SSO.

---

### 44. Huly
**Kategorie:** hr  
**Beschreibung:** All-in-One Plattform für HR, Projektmanagement und Teamkollaboration. Kombination aus Linear, Notion und Slack in einer Anwendung. Sehr modernes UI.  
**Image:** `hardcoreeng/huly`  
**Besonderheiten:** Einer der neuesten und ambitioniertesten Open-Source-Stacks. MongoDB-Backend.

---

### 45. TimeOff.Management
**Kategorie:** hr  
**Beschreibung:** Einfache Urlaubsverwaltung und Abwesenheitsplanung für Teams. Kalenderansicht, Genehmigungsworkflow und E-Mail-Benachrichtigungen. Sehr leichtgewichtig.  
**Image:** `timeoffmanagement/app`  
**Besonderheiten:** Single-Container, SQLite. Gut für kleine Teams die nur Urlaubsverwaltung brauchen.

---

## Daten & Analytics

### 46. Metabase
**Kategorie:** analytics  
**Beschreibung:** Business Intelligence und Daten-Visualisierung ohne SQL-Kenntnisse. Verbindet sich mit PostgreSQL, MySQL, MongoDB, Redshift und mehr. Dashboards und automatische Reports.  
**Image:** `metabase/metabase`  
**Besonderheiten:** H2 oder PostgreSQL als internes Backend. Open-Source Edition voll funktional.

---

### 47. Redash
**Kategorie:** analytics  
**Beschreibung:** SQL-basiertes BI-Tool mit Query-Editor, Visualisierungen, Dashboards und Alert-Funktionen. Ideal für technische Teams die direkte SQL-Abfragen bevorzugen.  
**Image:** `redash/redash`  
**Besonderheiten:** Redis + PostgreSQL-Backend. Multi-Container-Deploy.

---

### 48. NocoDB
**Kategorie:** analytics  
**Beschreibung:** Open-Source Airtable-Alternative. Verwandelt jede PostgreSQL-, MySQL- oder SQLite-Datenbank in ein kollaboratives Spreadsheet-Interface mit REST/GraphQL-API.  
**Image:** `nocodb/nocodb`  
**Besonderheiten:** Single-Container möglich. Sehr gut für No-Code-Datenbank-Frontends.

---

### 49. Baserow
**Kategorie:** analytics  
**Beschreibung:** Open-Source No-Code-Datenbank ähnlich Airtable mit Formular-Builder, API, Webhooks und Automations. PostgreSQL-Backend, Django + Vue.js.  
**Image:** `baserow/backend`  
**Besonderheiten:** Multi-Container. Stärker auf Collaboration ausgelegt als NocoDB.

---

### 50. Plausible Analytics
**Kategorie:** analytics  
**Beschreibung:** Datenschutzfreundliche Web-Analytics-Alternative zu Google Analytics. Kein Tracking, keine Cookies, DSGVO-konform by design. Einfaches Dashboard mit den wichtigsten Metriken.  
**Image:** `ghcr.io/plausible/community-edition`  
**Besonderheiten:** PostgreSQL + ClickHouse-Backend. Ideal für Tenants die Website-Analytics ohne Google-Abhängigkeit wollen.

---

## Zusammenfassung

| # | App | Kategorie | Priorität |
|---|---|---|---|
| 1 | Mattermost | Kommunikation | Hoch |
| 2 | Rocket.Chat | Kommunikation | Mittel |
| 3 | Matrix + Element | Kommunikation | Mittel |
| 4 | Listmonk | Kommunikation | Hoch |
| 5 | Zulip | Kommunikation | Niedrig |
| 6 | Plane | Projektmanagement | Hoch |
| 7 | Vikunja | Projektmanagement | Hoch |
| 8 | Taiga | Projektmanagement | Mittel |
| 9 | Focalboard | Projektmanagement | Niedrig |
| 10 | Leantime | Projektmanagement | Niedrig |
| 11 | Twenty CRM | CRM | Hoch |
| 12 | Monica CRM | CRM | Mittel |
| 13 | EspoCRM | CRM | Hoch |
| 14 | Odoo Community | ERP/CRM | Mittel |
| 15 | Krayin CRM | CRM | Niedrig |
| 16 | InvoiceNinja | Finance | Hoch |
| 17 | Crater | Finance | Mittel |
| 18 | Akaunting | Finance | Hoch |
| 19 | Firefly III | Finance | Mittel |
| 20 | ERPNext | ERP | Niedrig |
| 21 | Gitea | Dev-Tools | Hoch |
| 22 | Forgejo | Dev-Tools | Hoch |
| 23 | GitLab CE | Dev-Tools | Mittel |
| 24 | Drone CI | Dev-Tools | Mittel |
| 25 | Portainer | Dev-Tools | Hoch |
| 26 | Harbor | Dev-Tools | Niedrig |
| 27 | Verdaccio | Dev-Tools | Niedrig |
| 28 | Nexus Repository | Dev-Tools | Niedrig |
| 29 | Uptime Kuma | Monitoring | Hoch |
| 30 | Netdata | Monitoring | Mittel |
| 31 | Zabbix | Monitoring | Niedrig |
| 32 | OpenObserve | Monitoring | Mittel |
| 33 | Wazuh | Security | Mittel |
| 34 | CrowdSec | Security | Hoch |
| 35 | Netbird | Networking | Mittel |
| 36 | Headscale | Networking | Mittel |
| 37 | AdGuard Home | Networking | Hoch |
| 38 | Smallstep CA | Security | Niedrig |
| 39 | Immich | Media | Hoch |
| 40 | Jellyfin | Media | Mittel |
| 41 | Tube Archivist | Media | Niedrig |
| 42 | Calibre-Web | Documents | Niedrig |
| 43 | OrangeHRM | HR | Mittel |
| 44 | Huly | HR | Mittel |
| 45 | TimeOff.Management | HR | Hoch |
| 46 | Metabase | Analytics | Hoch |
| 47 | Redash | Analytics | Mittel |
| 48 | NocoDB | Analytics | Hoch |
| 49 | Baserow | Analytics | Mittel |
| 50 | Plausible Analytics | Analytics | Hoch |

---

*Erstellt: 2026-03 — Priorisierung basiert auf Nachfrage, Deploy-Aufwand und Überschneidungsfreiheit mit bestehenden Katalog-Apps.*
