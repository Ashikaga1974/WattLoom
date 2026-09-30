# Contributing zu WattLoom Cycling

> 🇬🇧 [English version](CONTRIBUTING.md)

WattLoom Cycling ist ein Hobby-Projekt, das in der Freizeit entwickelt wird. Beiträge sind willkommen,
aber bitte mit realistischen Erwartungen: Reviews und Antworten passieren best-effort, nicht
garantiert innerhalb bestimmter Fristen.

## Bugs melden

Bitte über [GitHub Issues](../../issues) mit dem "Bug"-Template. Je genauer die
Reproduktionsschritte (Betriebssystem, Docker vs. manuelle Installation, betroffene Seite/API-
Endpunkt), desto schneller lässt sich der Fehler eingrenzen.

## Feature-Wünsche

Ebenfalls über GitHub Issues mit dem "Feature Request"-Template. WattLoom Cycling ist bewusst als
Single-User-Anwendung für Strava-Exportdaten konzipiert (siehe
[Sicherheitshinweis](README.de.md#sicherheitshinweis)) – Vorschläge, die
Multi-User-Betrieb, Auth oder eine Live-Strava-API-Anbindung voraussetzen, passen nicht zur
Architektur und werden wahrscheinlich abgelehnt.

## Pull Requests

- Kleine, fokussierte PRs bevorzugt – ein PR, eine Änderung.
- Backend-Änderungen: bitte mit passenden Tests (`pytest`, siehe `tests/`).
- Frontend-Änderungen: `cd frontend && npx tsc --noEmit -p tsconfig.app.json` muss sauber
  durchlaufen (nicht `tsconfig.json` direkt – das prüft nichts, siehe [DEVELOPMENT.md](documentation/DEVELOPMENT.md#tests--checks)).
- Bestehenden Code-Stil beibehalten: viele kleine, fokussierte Funktionen, Kommentare nur
  dort, wo das WARUM nicht offensichtlich ist.
- Commit-Messages kurz und beschreibend, kein festes Schema erzwungen.

## Entwicklungsumgebung einrichten

Siehe [documentation/DEVELOPMENT.md](documentation/DEVELOPMENT.md) (Englisch) für die vollständige Anleitung
(Backend/Frontend manuell oder per Docker).

## Lizenz

Mit einem Beitrag stimmst du zu, dass dein Code unter der Projektlizenz (AGPL-3.0, siehe
[LICENSE](LICENSE)) veröffentlicht wird.
