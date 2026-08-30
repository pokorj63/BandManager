from __future__ import annotations

import io
import re
import unicodedata
from typing import Optional
from pypdf import PdfReader, PdfWriter


def normalize_text(text: str) -> str:
    """Normalizes text by lowercasing and stripping diacritics, attached tempo glyphs, and excess whitespace."""
    if not text:
        return ""
    text = text.lower()
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    # Separate attached tempo glyphs like 'fluteq. = 68' -> 'flute q. = 68' or '1q. = 68' -> '1 q. = 68'
    text = re.sub(r"([a-z0-9])([qeh]\s*[\.=])", r"\1 \2", text)
    # Separate letter attached to digit (e.g. 'sax1' -> 'sax 1', '1a' -> '1 a')
    text = re.sub(r"([a-z])([1-5])\b", r"\1 \2", text)
    text = re.sub(r"\b([1-5])([a-z])", r"\1 \2", text)
    return " ".join(text.split())


SCORE_KEYWORDS = [
    "partitura",
    "score",
    "full score",
    "conductor",
    "direkt",
    "dirigent",
    "vse",
    "master score",
    "condensed score",
]

# Order matters: more specific families / multi-word keywords first!
DETECTION_RULES = [
    # Bass Trombone MUST be before Bass and before Trombone
    {
        "canonical": "Bass Trombone",
        "family": "Trombone",
        "num": "bass",
        "keywords": [
            "bass trombone",
            "basstrombone",
            "basovy pozoun",
            "basstrb",
            "b. tbn",
            "b.tbn",
            "b tbn",
            "b. trb",
            "b.trb",
            "b trb",
        ],
    },
    # Synth Brass before Piano
    {
        "canonical": "Synth Brass",
        "family": "Piano",
        "num": None,
        "keywords": [
            "synth brass",
            "syn. br.",
            "syn br",
            "syn.br",
            "syn brass",
            "synth",
            "synthesizer",
        ],
    },
    {
        "canonical": "Baritone Sax",
        "family": "Baryton Sax",
        "num": None,
        "keywords": [
            "baritone sax",
            "baryton sax",
            "baritone saxophone",
            "baritonesax",
            "barytonsax",
            "bsax",
            "b.sax",
            "bar. sax",
            "bar.sax",
            "bar sax",
            "baritone",
            "baryton",
            "bari",
            "eb baritone",
        ],
    },
    {
        "canonical": "Alto Sax",
        "family": "Alto Sax",
        "num": "detect",
        "keywords": [
            "alto sax",
            "alt sax",
            "alto saxophone",
            "altsax",
            "asax",
            "a.sax",
            "a. sax",
            "a sax",
            "es alt",
            "eb alto",
            "alto",
            "alt",
        ],
    },
    {
        "canonical": "Tenor Sax",
        "family": "Tenor Sax",
        "num": "detect",
        "keywords": [
            "tenor sax",
            "tenor saxophone",
            "tenorsax",
            "tsax",
            "t.sax",
            "t. sax",
            "t sax",
            "b tenor",
            "bb tenor",
            "tenor",
        ],
    },
    {
        "canonical": "Soprano Sax",
        "family": "Soprano Sax",
        "num": "detect",
        "keywords": [
            "soprano sax",
            "sopranosax",
            "soprano saxophone",
            "ssax",
            "s.sax",
            "sopran",
            "soprano",
        ],
    },
    {
        "canonical": "Trumpet",
        "family": "Trumpet",
        "num": "detect",
        "keywords": [
            "trumpet",
            "trubka",
            "tpt",
            "tpt.",
            "trp",
            "trp.",
            "tp",
            "tp.",
            "cornet",
            "flugelhorn",
            "kridlovka",
            "bb trumpet",
            "b trubka",
        ],
    },
    {
        "canonical": "Trombone",
        "family": "Trombone",
        "num": "detect",
        "keywords": [
            "trombone",
            "pozoun",
            "tbn",
            "tbn.",
            "trb",
            "trb.",
            "trbn",
            "trbn.",
            "pzn",
            "pzn.",
            "trombon",
        ],
    },
    {
        "canonical": "Flute",
        "family": "Flute",
        "num": "detect",
        "keywords": [
            "flute",
            "fletna",
            "flauto",
            "fl",
            "fl.",
            "piccolo",
            "pikola",
        ],
    },
    {
        "canonical": "Clarinet",
        "family": "Clarinet",
        "num": "detect",
        "keywords": [
            "clarinet",
            "klarinet",
            "cl",
            "cl.",
            "kl",
            "kl.",
            "bb clarinet",
            "b klarinet",
            "bass clarinet",
            "basklarinet",
        ],
    },
    {
        "canonical": "Horn",
        "family": "Horn",
        "num": "detect",
        "keywords": [
            "french horn",
            "lesni roh",
            "horn",
            "corno",
            "f horn",
            "waldhorn",
        ],
    },
    {
        "canonical": "Tuba",
        "family": "Tuba",
        "num": None,
        "keywords": ["tuba", "sousaphone", "heligon"],
    },
    {
        "canonical": "Guitar",
        "family": "Guitar",
        "num": "detect",
        "keywords": [
            "guitar",
            "kytara",
            "electric guitar",
            "el guitar",
            "el. guitar",
            "ac guitar",
            "ac. guitar",
            "gtr",
            "gtr.",
            "git",
            "git.",
            "kyt",
            "jazz guitar",
            "rhythm guitar",
        ],
    },
    {
        "canonical": "Piano",
        "family": "Piano",
        "num": "detect",
        "keywords": [
            "piano",
            "klavir",
            "keys",
            "keyboard",
            "klavesy",
            "pno",
            "pno.",
            "kbd",
            "kbd.",
            "kybd",
            "organ",
            "rhodes",
            "piano conductor",
            "piano vocal",
            "pianino",
        ],
    },
    {
        "canonical": "Bass",
        "family": "Bass",
        "num": "detect",
        "keywords": [
            "bass guitar",
            "baskytara",
            "bass",
            "basa",
            "bassguitar",
            "electric bass",
            "el bass",
            "el. bass",
            "kontrabas",
            "upright bass",
            "string bass",
            "bg",
            "bgy",
        ],
    },
    {
        "canonical": "Drums",
        "family": "Drums",
        "num": None,
        "keywords": [
            "drums",
            "bici",
            "drum set",
            "drum kit",
            "bici souprava",
            "percussion",
            "perc",
            "perc.",
            "dr",
            "dr.",
            "drum",
            "souprava",
            "cymbals",
            "congas",
            "timpani",
        ],
    },
    {
        "canonical": "Lead Vocal",
        "family": "Main Vocals",
        "num": None,
        "keywords": [
            "lead vocal",
            "vocal",
            "zpev",
            "voice",
            "solo vocal",
            "vocal solo",
            "zpevak",
            "zpevacka",
            "main vocal",
            "main voice",
            "lyrics",
            "text",
            "lead",
        ],
    },
    {
        "canonical": "Back Vocals",
        "family": "Back Vocals",
        "num": None,
        "keywords": [
            "back vocal",
            "back vocals",
            "backing vocals",
            "sbor",
            "choir",
            "vokaly",
            "vok",
            "bvox",
            "bg vox",
            "coro",
            "vocal group",
        ],
    },
]


def extract_num_following_or_preceding(text: str, keywords: list[str]) -> Optional[str]:
    """Finds the number (1, 2, 3, 4, 1st, 2nd, etc.) directly following or preceding the instrument keyword."""
    ordinal_map = {
        "1st": "1",
        "2nd": "2",
        "3rd": "3",
        "4th": "4",
        "5th": "5",
        "first": "1",
        "second": "2",
        "third": "3",
        "fourth": "4",
        "prvni": "1",
        "druhy": "2",
        "treti": "3",
        "ctvrty": "4",
        "i": "1",
        "ii": "2",
        "iii": "3",
        "iv": "4",
        "v": "5",
        "1": "1",
        "2": "2",
        "3": "3",
        "4": "4",
        "5": "5",
    }

    # 1. Number following keyword: e.g. "alto sax 1", "trumpet 2", "tbn 3" (bare digit or ordinal)
    for kw in keywords:
        pattern = (
            r"(?:^|[^a-z0-9])"
            + re.escape(kw)
            + r"[\s\.\-_]*([1-5]|1st|2nd|3rd|4th|5th|i{1,3}|iv|v)(?:$|[^a-z0-9])"
        )
        m = re.search(pattern, text)
        if m:
            raw = m.group(1).lower()
            return ordinal_map.get(raw, raw)

    # 2. Number preceding keyword: MUST be ordinal like "1st alto sax", "2nd trumpet", "1. trubka", "i. pozoun"
    # Note: Bare digits before keyword (like "2 flute" or "2 bass") are PAGE NUMBERS within that part, not instrument indices!
    for kw in keywords:
        pattern = (
            r"(?:^|[^a-z0-9])(1st|2nd|3rd|4th|5th|first|second|third|fourth|prvni|druhy|treti|ctvrty|[1-5]\.|i{1,3}\.|iv\.)[\s\.\-_]*"
            + re.escape(kw)
            + r"(?:$|[^a-z0-9])"
        )
        m = re.search(pattern, text)
        if m:
            raw = m.group(1).lower().rstrip(".")
            return ordinal_map.get(raw, raw)

    return None


def detect_page_part_identity(text: str) -> tuple[str, str, Optional[str]]:
    """
    Returns (part_key: str, family: str, num: Optional[str])
    part_key is a unique string identifying the exact part in the PDF (e.g. 'Score', 'Flute', 'Alto Sax 1', 'Alto Sax 2', 'Bass Trombone').
    """
    norm = normalize_text(text)

    # 1. Count distinct instrument families in text
    families_present = set()
    for rule in DETECTION_RULES:
        for kw in rule["keywords"]:
            pattern = r"(^|[^a-z0-9])" + re.escape(kw) + r"($|[^a-z0-9])"
            if re.search(pattern, norm):
                families_present.add(rule["family"])
                break

    # If 3 or more distinct instrument families appear, it is a Full Score!
    if len(families_present) >= 3:
        return "Score", "Score", None

    # Check explicit Score keywords (unless it's piano conductor/vocal)
    is_piano_conductor = any(
        kw in norm
        for kw in [
            "piano conductor",
            "piano / conductor",
            "piano vocal",
            "piano / vocal",
            "pno / cond",
            "pno/cond",
        ]
    )
    if not is_piano_conductor:
        for kw in SCORE_KEYWORDS:
            pattern = r"(^|[^a-z0-9])" + re.escape(kw) + r"($|[^a-z0-9])"
            if re.search(pattern, norm):
                return "Score", "Score", None

    # 2. Match rules in priority order
    for rule in DETECTION_RULES:
        kw_matched = None
        for kw in rule["keywords"]:
            pattern = r"(^|[^a-z0-9])" + re.escape(kw) + r"($|[^a-z0-9])"
            if re.search(pattern, norm):
                kw_matched = kw
                break

        if kw_matched:
            canonical = rule["canonical"]
            family = rule["family"]

            if rule["num"] == "detect":
                num = extract_num_following_or_preceding(norm, rule["keywords"])
                part_key = f"{canonical} {num}" if num else canonical
                return part_key, family, num
            elif rule["num"] == "bass":
                return canonical, family, "bass"
            else:
                return canonical, family, None

    return "Other", "Other", None


def map_part_to_band_instrument(
    part_key: str, family: str, num: Optional[str], band_instruments: list[dict]
) -> tuple[str, Optional[str], str]:
    """
    Maps detected intrinsic PDF part (part_key) to best match in user's band setup.
    Returns: (file_type: 'score'|'part'|'other', instrument_name: Optional[str], title: str)
    """
    if part_key == "Score":
        return "score", None, "Partitura"
    if part_key == "Other":
        return "other", None, "Neznámý oddíl"

    tracked_names = [b["name"] for b in band_instruments]
    norm_pkey = normalize_text(part_key)

    # 1. Exact match with DB instrument name
    for b_name in tracked_names:
        if normalize_text(b_name) == norm_pkey:
            return "part", b_name, f"Part: {b_name}"

    # 2. Family + Number match in DB
    candidates = []
    for b_name in tracked_names:
        norm_b = normalize_text(b_name)
        for rule in DETECTION_RULES:
            if rule["family"] == family:
                if any(kw in norm_b for kw in rule["keywords"]):
                    b_num = extract_num_following_or_preceding(norm_b, rule["keywords"])
                    candidates.append({"name": b_name, "num": b_num, "norm": norm_b})

    if candidates:
        if num == "bass":
            bass_cand = next((c for c in candidates if "bas" in c["norm"]), None)
            if bass_cand:
                return "part", bass_cand["name"], f"Part: {bass_cand['name']}"
            return "part", candidates[-1]["name"], f"Part: {candidates[-1]['name']}"

        if num:
            exact_c = next((c for c in candidates if c["num"] == num), None)
            if exact_c:
                return "part", exact_c["name"], f"Part: {exact_c['name']}"

        # Fallback to single unnumbered candidate or first
        no_num = next((c for c in candidates if c["num"] is None), None)
        if no_num:
            return "part", no_num["name"], f"Part: {no_num['name']}"

    # 3. If not found in current DB setup, keep detected canonical name as a clean part!
    return "part", part_key, f"Part: {part_key}"


def match_instrument_name(
    header_text: str, full_page_text: str, band_instruments: list[str]
) -> tuple[str, Optional[str], float]:
    """Compatibility wrapper for single file analysis."""
    combined_text = f"{header_text}\n{full_page_text}"
    pkey, fam, num = detect_page_part_identity(combined_text)

    band_dicts = [{"name": name} for name in band_instruments]
    ft, inst_name, _ = map_part_to_band_instrument(pkey, fam, num, band_dicts)
    return ft, inst_name, 0.95 if ft != "other" else 0.0


def segment_pdf(
    pdf_bytes: bytes,
    song_title: str,
    band_instruments: list[dict],
    existing_song_files: list[dict],
) -> list[dict]:
    """
    Parses the PDF, inspects each page's text, detects instrument/score transitions,
    and groups contiguous pages into clean part segments.
    """
    reader = PdfReader(io.BytesIO(pdf_bytes))
    total_pages = len(reader.pages)
    if total_pages == 0:
        return []

    tracked_inst_names = [
        inst["name"] for inst in band_instruments if inst.get("is_tracked", True)
    ]
    existing_inst_files = {
        f.get("instrument_name") for f in existing_song_files if f.get("file_type") == "part"
    }
    has_existing_score = any(f.get("file_type") == "score" for f in existing_song_files)

    # Step 1: Detect intrinsic part identity of each page
    page_infos = []
    for idx, page in enumerate(reader.pages):
        raw_text = page.extract_text() or ""
        lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
        header_snippet = " | ".join(lines[:4]) if lines else ""

        part_key, family, num = detect_page_part_identity(raw_text)

        page_infos.append(
            {
                "page_num": idx + 1,  # 1-indexed
                "part_key": part_key,
                "family": family,
                "num": num,
                "header_snippet": header_snippet[:120],
                "raw_text": raw_text,
            }
        )

    # Step 2: Group contiguous pages into segments based on part_key
    segments = []
    current_segment = None

    for p in page_infos:
        is_new_part = (current_segment is None) or (p["part_key"] != current_segment["part_key"])

        if is_new_part:
            if current_segment:
                segments.append(current_segment)

            ft, inst_name, title = map_part_to_band_instrument(
                p["part_key"], p["family"], p["num"], band_instruments
            )

            current_segment = {
                "part_key": p["part_key"],
                "family": p["family"],
                "num": p["num"],
                "file_type": ft,
                "instrument_name": inst_name,
                "title": title,
                "page_start": p["page_num"],
                "page_end": p["page_num"],
                "header_snippet": p["header_snippet"],
                "confidence": 0.95 if ft != "other" else 0.0,
            }
        else:
            current_segment["page_end"] = p["page_num"]

    if current_segment:
        segments.append(current_segment)

    # Step 3: Decorate segments with status metadata
    for seg in segments:
        seg_type = seg["file_type"]
        inst_name = seg["instrument_name"]
        page_count = seg["page_end"] - seg["page_start"] + 1
        seg["page_count"] = page_count

        if seg_type == "score":
            seg["title"] = "Partitura"
            seg["is_missing"] = not has_existing_score
            seg["already_exists"] = has_existing_score
            seg["is_tracked"] = True
        elif seg_type == "part" and inst_name:
            is_tracked = inst_name in tracked_inst_names
            already_exists = inst_name in existing_inst_files
            seg["is_missing"] = is_tracked and not already_exists
            seg["already_exists"] = already_exists
            seg["is_tracked"] = is_tracked
        else:
            seg["title"] = f"Neznámý oddíl (strany {seg['page_start']}–{seg['page_end']})"
            seg["is_missing"] = False
            seg["already_exists"] = False
            seg["is_tracked"] = False

    return segments


def extract_pdf_pages(pdf_bytes: bytes, page_start: int, page_end: int) -> bytes:
    """Extracts a page range (1-indexed inclusive) from a PDF and returns new PDF bytes."""
    reader = PdfReader(io.BytesIO(pdf_bytes))
    writer = PdfWriter()

    start_idx = max(0, page_start - 1)
    end_idx = min(len(reader.pages), page_end)

    for idx in range(start_idx, end_idx):
        writer.add_page(reader.pages[idx])

    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()
