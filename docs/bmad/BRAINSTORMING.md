# BRAINSTORMING – GMZ Cloud Business Apps

## 1) Problem Framing (konkret)
GMZ braucht eine interne Plattform, mit der IT-Techniker standardisiert Kundenumgebungen ausrollen und betreiben können, ohne pro Kunde „Sonderbau“.

### Kernproblem heute
- Onboarding ist zu manuell (VM, Netzwerk, DNS, Reverse Proxy, SSO, App-Installationen).
- Betriebsqualität variiert je nach Techniker und Tagesform.
- Updates sind riskant, weil Rollback nicht durchgängig automatisiert ist.
- Multi-Tenant-Betrieb skaliert schlecht ohne klare Isolation und Standards.

### Zielproblem, das wir lösen
Eine reproduzierbare Provisioning- und Betriebsstrecke für Business-Apps pro Kunde, mit klaren Guardrails:
- **Pro Kunde genau 1 Tenant-VM**
- **feste Netzkonvention** (`VLAN-ID`, IP `10.<vlan>.10.100`)
- **zentrales Routing/TLS** (Traefik + IONOS DNS)
- **Authentik je Tenant verpflichtend**
- **Nightly Updates mit Snapshot + Healthcheck + Auto-Rollback**

---

## 2) Primäre Persona: interner IT-Techniker / Admin

## Aufgaben im Alltag
- neuen Kunden onboarden
- App-Stack nach Katalog auswählen und deployen
- SSO anbinden (Entra / LDAP / Local)
- Betriebsstatus monitoren, Updates fahren, bei Fehlern schnell zurückrollen
- Auditierbar dokumentieren, wer was geändert hat

## Persona Needs (funktional)
- Geführter Setup-Flow (Wizard), kein „Wiki-Hopping“
- Idempotente Runs (erneut ausführbar ohne Chaos)
- Schnelle Diagnose bei Failures (klare Fehlerursache + nächster Schritt)
- Einheitliche Konventionen für DNS, Ports, Labels, Secrets
- Ein Klick für planbare Nightly-Updates je Tenant-Fenster

## Persona Needs (nicht-funktional)
- Verlässlichkeit > maximale Flexibilität
- Vorhersagbare Laufzeiten (Provisioning/Deploy)
- Niedrige kognitive Last (weniger Sonderfälle)
- Nachvollziehbarkeit/Auditfähigkeit

---

## 3) Architektur-Optionen, die diskutiert wurden

## Option A – **Final gewählt**: 1 Tenant-VM pro Kunde (Docker Compose in VM)
**Beschreibung**
- Proxmox 9 hostet pro Kunde eine Debian-13 VM.
- In der VM laufen Authentik + gewählte Business-Apps via Compose.
- Zentrales Traefik auf Management-VM terminiert TLS und routed auf Tenant-VM.

**Vorteile**
- Sehr klare Isolation pro Kunde (Compute, Netzwerk, Runtime).
- Einfache mentale Modellierung für Betrieb/Support.
- Snapshot/Rollback auf VM-Ebene robust umsetzbar.
- Gute Passung zu festen IP-/VLAN-Konventionen.

**Nachteile**
- Mehr Ressourcenverbrauch als shared runtime.
- Patch-/Lifecycle pro VM muss sauber automatisiert sein.

---

## Option B – Shared Kubernetes-Cluster mit Namespaces pro Kunde
**Beschreibung**
- Alle Kunden auf gemeinsamem Cluster, Isolation über Namespace/Policies.

**Vorteile**
- Hohe Ressourceneffizienz.
- Elastische Skalierung einzelner Workloads.

**Nachteile (entscheidend)**
- Höhere Komplexität (Netzwerk/Policy/Operations).
- Größerer Blast Radius bei Cluster-Problemen.
- Snapshot-Rollback nicht so deterministisch wie VM-Snapshot.
- Overkill für v1-Zielbild und Teamgröße.

**Entscheidung**: verworfen für v1; evtl. später für einzelne App-Klassen evaluieren.

---

## Option C – 1 Proxmox-Host pro Kunde
**Vorteile**
- Maximale physische/operative Trennung.

**Nachteile**
- Wirtschaftlich und operativ unattraktiv (Kosten, Management-Overhead).
- Verlangsamt Standardisierung.

**Entscheidung**: verworfen.

---

## 4) Fixe Constraints (nicht verhandelbar) und Auswirkung
- **Proxmox 9** als Virtualisierungsbasis → OpenTofu/Ansible auf API-Objekte und Debian-Templates ausrichten.
- **One tenant VM per customer** → alle Deploy/Update-Runbooks VM-zentriert.
- **Feste VLAN-ID pro Kunde** → Netzwerkparameter Pflichtfelder im Wizard.
- **Statische Tenant-IP `10.<vlan>.10.100`** → DNS/Traefik-Automation deterministisch.
- **Zentraler Traefik** → Tenant-VMs exponieren nur intern, Edge zentral abgesichert.
- **IONOS DNS** → ACME DNS-Challenge und Hostname-Provisioning direkt integrieren.
- **Authentik je Tenant** → App-Deploy abhängig von erfolgreicher Authentik-Basis.
- **Vollständiger Initial-App-Katalog** muss deploybar sein:
  - authentik
  - nextcloud (+ talk, collabora)
  - IT Tools
  - paperless-ngx
  - vaultwarden
  - bookstack
  - joplin
  - libretranslate
  - ollama
  - openwebui
  - searxng
  - snipe-it
  - wiki.js
- **Nightly Updates mit Snapshot + Rollback** → kein Update ohne Pre-Snapshot und Health-Gate.

---

## 5) Trade-offs (bewusst akzeptiert)
1. **Isolation vs. Dichte**
   - Entscheidung zugunsten Isolation (1 VM/Tenant), trotz höherem Ressourcenbedarf.
2. **Standardisierung vs. Kunden-Sonderwünsche**
   - Standardpfad priorisiert; Abweichungen nur über katalogisierte Variablen.
3. **Schnelle Delivery vs. tiefe HA-Komplexität**
   - Erst Single-Host stabilisieren, HA als Readiness-Track (v1.5).
4. **Einfaches Runtime-Modell (Compose) vs. maximale Orchestrierungsfeatures (K8s)**
   - Compose genügt für v1-Fit und reduziert Betriebsrisiko.

---

## 6) Risiken + Gegenmaßnahmen

## R1: Proxmox API/Permission-Mismatch blockiert Provisioning
- **Mitigation**: Setup-Wizard mit Preflight (Role, Token, Storage, Bridge, VLAN-Tagging, Cloud-Init-Template).
- **Exit-Kriterium**: Kein produktiver Run ohne grünen Preflight.

## R2: DNS/TLS-Automation instabil (IONOS/Rate Limits/Fehlkonfig)
- **Mitigation**: DNS-Healthcheck vor Deploy, Retry-Strategie, ACME-Fehler als harte Blocker mit klarer Fehlermeldung.

## R3: App-Heterogenität führt zu unzuverlässigen Deployments
- **Mitigation**: striktes Katalog-Schema, Pflicht-Healthchecks pro App, staged rollout (pilot tenants).

## R4: Nightly Updates verursachen Downtime
- **Mitigation**: Wartungsfenster je Tenant, Snapshot vor Update, sequenzielle Updates, Health-gesteuerter Auto-Rollback.

## R5: Secret Handling wird Sicherheits-/Delivery-Bottleneck
- **Mitigation**: kurzfristig Envelope-Encryption + strikte Secret-Injection; Vault-Adapter als spätere Erweiterung.

## R6: Observability zu spät, Fehlerdiagnose zu langsam
- **Mitigation**: Monitoring/Logging als Pflicht vor flächigem Auto-Update-Rollout.

---

## 7) Arbeitsannahmen (zu validieren)
- Debian-13-Template ist konsistent und cloud-init-ready.
- UniFi/VLAN-Setup akzeptiert die feste Kundenkonvention ohne Ausnahmen.
- IONOS API-Credentials sind stabil verfügbar und ausreichend privilegiert.
- Alle Initial-Apps sind auf Compose-Basis in v1 realistisch betreibbar.
- Kunden akzeptieren definierte Wartungsfenster für Nightly-Runs.
- Backup bleibt v1 out-of-scope (Snapshots nur für Update-Rollback, nicht als Backup-Produkt).

---

## 8) Success Criteria (messbar)

## Provisioning
- Neuer Tenant von „Anlegen“ bis „erreichbare Services“ in **<= 15 Minuten** (nach bereitstehender Mgmt-VM).
- 100% reproduzierbarer Run ohne manuelle Nacharbeit bei Referenzkonfiguration.

## Betriebsfähigkeit
- Nightly-Update-Job läuft je Tenant im Wartungsfenster automatisiert.
- Bei fehlgeschlagenem Healthcheck erfolgt Auto-Rollback in definierter Zeit (Runbook-konform).
- Zentrale Dashboards zeigen Tenant-/App-/Auth-Status vollständig.

## Governance
- Jede Aktion (Provision/Deploy/Update/Rollback) auditierbar (wer/was/wann).
- Keine Secrets im Repo-Klartext.

## Produktumfang
- Alle Initial-Apps aus dem Katalog sind deploybar und health-checkbar.

---

## 9) Final Strategic Choices (v1)
1. **Architekturpfad fixieren**: Single-Host production first, HA nur vorbereiten (nicht vorziehen).
2. **Deployment-Modell fixieren**: Compose-basierter App-Katalog, kein K8s in v1.
3. **Security-by-default**: Tenant-Isolation über VLAN + VM-Grenze + zentrale Edge.
4. **SSO-first**: Authentik als Pflichtbestandteil jedes Tenants, App-Integrationen darauf aufbauen.
5. **Operations-first**: Observability + Update/Rollback nicht „später“, sondern Kern der ersten produktiven Ausbaustufe.
6. **Governance eingebaut**: RBAC, Audit, deterministische Konventionen als Teil der Plattform, nicht als Dokumentation allein.

---

## 10) Sofort umsetzbare nächste Schritte
1. Wizard-Preflight-Matrix finalisieren (Proxmox, DNS, Traefik, Templates, Secrets).
2. OpenTofu-Modul für Tenant-VM hart auf VLAN/IP-Konvention validieren.
3. Catalog-Validator + Healthcheck-Profil je Initial-App fertigstellen.
4. Nightly-Update-Worker mit Snapshot/Health/Rollback als End-to-End Teststrecke auf 1 Pilot-Tenant.
5. Go/No-Go-Checkliste für „erste produktive Kundenaufschaltung“ dokumentieren.
