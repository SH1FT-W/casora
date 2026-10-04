"""Test-KI (ai_task) der Mock-Integration – nur für das Docker-Test-HA.

Kein Sprachmodell: beantwortet die Anfrage des Casora-Geräte-Assistenten
deterministisch über Wortvergleich, damit der Weg Panel → ai_task.generate_data
→ strukturierte Antwort getestet werden kann. Erkennt Geräte-Zeilen
„ID | Name | Raum: … | Typ: …“, die Raumliste „Räume: …“ und den Nutzersatz in
Anführungszeichen.
"""
from __future__ import annotations

import os
import re

from homeassistant.components.ai_task import AITaskEntity, AITaskEntityFeature, GenDataTask, GenDataTaskResult
from homeassistant.components.conversation import ChatLog


def _norm(s: str) -> str:
    s = s.lower()
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
        s = s.replace(a, b)
    return s


def _fields(instructions: str) -> dict:
    """Casora-Kachel-Felder: je Feld die Kandidatenzeile mit den meisten Treffern."""
    fields, cands, part = [], [], None
    for line in instructions.splitlines():
        if line.startswith("Felder"):
            part = "f"
        elif line.startswith("Kandidaten"):
            part = "c"
        elif part == "f" and line.startswith("- "):
            k, label, doms = [p.strip() for p in line[2:].split("|")]
            fields.append((k, label, [d.strip() for d in doms.split(",")]))
        elif part == "c" and "|" in line:
            cands.append([p.strip() for p in line.split("|")])
    out = {}
    for key, label, doms in fields:
        words = [w for w in re.split(r"[^a-z0-9]+", _norm(label + " " + key.replace("_", " "))) if len(w) > 3]
        best, hit = 0, ""
        for c in cands:
            if c[0].split(".")[0] not in doms:
                continue
            hay = _norm(" ".join(c))
            score = sum(1 for w in words if w in hay)
            if score > best:
                best, hit = score, c[0]
        out[key] = hit
    return out


def _answer(instructions: str) -> dict:
    if instructions.startswith("Casora Kachel-Felder"):
        return _fields(instructions)
    said = re.search(r'"([^"]*)"', instructions)
    words = [w for w in re.split(r"[^a-z0-9]+", _norm(said.group(1) if said else "")) if len(w) > 2]
    ids, best = [], 0
    for line in instructions.splitlines():
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 3:
            continue
        score = sum(1 for w in words if w in _norm(parts[1]))
        if score > best:
            ids, best = [parts[0]], score
        elif score and score == best:
            ids.append(parts[0])
    room = ""
    m = re.search(r"^Räume: (.*)$", instructions, re.M)
    if m:
        for name in [r.strip() for r in m.group(1).split(",")]:
            if name and _norm(name) in " ".join(words):
                room = name
    return {"ids": ids, "room": room, "type": ""}


def _tile_type(instructions: str) -> dict:
    """Eigene Kachelart: sichtbare, deterministische Änderung je nach Wunsch (kein Sprachmodell).

    „rot“/„red“ färbt den Namen rot, „rund“/„eckig“ ändert die Rundung, sonst ein grüner Rahmen.
    Die Änderung wird ans Ende von styles/… angehängt, wie Casora es von der KI verlangt."""
    import json

    said = re.search(r'^"(.*)"$', instructions, re.M)
    wish = _norm(said.group(1) if said else "")
    raw = instructions.rsplit("VORLAGE:\n", 1)[-1]
    try:
        tpl = json.loads(raw)
    except ValueError:
        tpl = {}
    styles = tpl.get("styles") if isinstance(tpl.get("styles"), dict) else {}

    def append(area: str, value: dict) -> dict:
        have = styles.get(area)
        n = len(have) if isinstance(have, list) else 0
        if not isinstance(have, list):
            return {"op": "set", "path": f"styles/{area}", "value": [value]}
        return {"op": "set", "path": f"styles/{area}/{n}", "value": value}

    if "rot" in wish or "red" in wish:
        ops = [append("name", {"color": "var(--casora-color-red, #FF453A)"})]
        note = "Der Name der Kachel ist jetzt rot (Test-KI)."
    elif "eckig" in wish or "rund" in wish or "square" in wish:
        ops = [append("card", {"border-radius": "6px"})]
        note = "Die Kachel hat jetzt kleinere Ecken (Test-KI)."
    else:
        ops = [append("card", {"box-shadow": "inset 0 0 0 2px var(--casora-color-green, #30D158)"})]
        note = "Die Kachel hat jetzt einen grünen Rand (Test-KI)."
    return {"ops": json.dumps(ops), "changes": [note]}


def _canned(name: str, instructions: str):
    """Feste Beispielantworten für Casoras KI-Funktionen (Coaches, Kamera, Pflanzen, Updates, Rezept)."""
    if "Coach" in name:
        rooms = re.findall(r"^- ([^:]+):", instructions, re.M)
        return {"zustand": "beobachten", "fazit": "Test-Auswertung aus dem Test-HA.",
                "erkenntnisse": ["Erste Beobachtung (Test)", "Zweite Beobachtung (Test)"],
                "tipps": ["Test-Tipp"], "ersparnis_eur": 1.5,
                "raeume": [f"{r} | gut | Werte unauffällig (Test) | " for r in rooms]}
    if name.startswith("Casora Kamera"):
        return {"beschreibung": "Testbild: niemand zu sehen.", "auffaellig": False}
    if name.startswith("Casora Pflanzen-Doktor"):
        return {"zustand": "gut", "fazit": "Pflanze wirkt gesund (Test).", "punkte": ["Boden feucht"], "tipps": ["In 3 Tagen gießen"]}
    if name.startswith("Casora Update-Analyse"):
        return {"level": "info", "headline": "Nichts zu tun (Test)", "summary": "Test-Einschätzung.", "affects": [], "todo": [], "source": ""}
    if name.startswith("Casora Umzug"):
        # Kein echtes Zusammenführen: keine Änderungen, Casoras Fassung bleibt – der Weg im Studio ist testbar.
        return {"ops": "[]", "changes": ["Test-KI: keine Änderungen"]}
    if name.startswith("Casora Kachelart"):
        return _tile_type(instructions)
    if name.startswith("Casora Rezept"):
        return {"name": "Kürbissuppe (Test)", "minutes": 30, "link": "", "reason": "Herbst.", "ingredients": ["1 Kürbis", "1 Zwiebel"]}
    return None


class MockAITask(AITaskEntity):
    _attr_name = "Casora Test-KI"
    _attr_unique_id = "casora_mock_ai_task"
    _attr_supported_features = AITaskEntityFeature.GENERATE_DATA | AITaskEntityFeature.SUPPORT_ATTACHMENTS

    async def _async_generate_data(self, task: GenDataTask, chat_log: ChatLog) -> GenDataTaskResult:
        name = task.name or ""
        # Jede Anfrage ablegen, damit Tests prüfen können, welche Daten die KI bekäme.
        path = self.hass.config.path("ki_test", re.sub(r"[^A-Za-z0-9_-]+", "_", name)[:60] + ".txt")

        def _write():
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(task.instructions)

        await self.hass.async_add_executor_job(_write)
        if name.startswith("Casora Umzug"):
            # Kurz warten, damit Laufzeit und Restzeit in der Oberfläche zu sehen sind.
            import asyncio
            await asyncio.sleep(1.5)
        data = _canned(name, task.instructions)
        if data is None:
            data = _answer(task.instructions)
        return GenDataTaskResult(conversation_id=chat_log.conversation_id, data=data)


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities([MockAITask()])
