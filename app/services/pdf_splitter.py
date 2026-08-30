from __future__ import annotations

import io
import re
import unicodedata
from typing import Optional
from pypdf import PdfReader, PdfWriter


def normalize_text(text: str) -> str:
    """Normalizes text by lowercasing and stripping diacritics and excess whitespace."""
    if not text:
        return ""
    text = text.lower()
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return " ".join(text.split())


# Standard music instrument aliases and keyword patterns
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

INSTRUMENT_FAMILIES = [
    {
        "family": "Alto Sax",
        "keywords": [
            "alto sax",
            "alto saxophone",
            "altsax",
            "alt sax",
            "alto",
            "asax",
            "a.sax",
            "a. sax",
            "a sax",
            "es alt",
            "eb alto",
            "alt",
        ],
    },
    {
        "family": "Tenor Sax",
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
        "family": "Baryton Sax",
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
        "family": "Soprano Sax",
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
        "family": "Trumpet",
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
        "family": "Trombone",
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
            "basstrombone",
            "bass trombone",
            "basovy pozoun",
            "basstrb",
            "b. tbn.",
            "b.tbn",
            "b. trb",
            "b.trb",
            "b tbn",
            "b trb",
        ],
    },
    {
        "family": "Clarinet",
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
        "family": "Flute",
        "keywords": ["flute", "fletna", "flauto", "fl", "fl.", "piccolo", "pikola"],
    },
    {
        "family": "Horn",
        "keywords": ["french horn", "lesni roh", "horn", "corno", "f horn", "waldhorn"],
    },
    {
        "family": "Tuba",
        "keywords": ["tuba", "sousaphone", "heligon"],
    },
    {
        "family": "Piano",
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
            "synthesizer",
            "synth brass",
            "synth",
            "syn. br.",
            "syn br",
            "syn.br",
            "syn",
            "organ",
            "rhodes",
            "piano conductor",
            "piano vocal",
            "pianino",
        ],
    },
    {
        "family": "Guitar",
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
        "family": "Bass",
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
        "family": "Drums",
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
        "family": "Main Vocals",
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
        "family": "Back Vocals",
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


def extract_instrument_number_for_family(text: str, family_keywords: list[str]) -> Optional[str]:
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

    # 1. Check directly following: e.g. "alto sax 1", "trumpet 2", "tbn 3"
    for kw in family_keywords:
        pattern = (
            r"(?:^|[^a-z0-9])"
            + re.escape(kw)
            + r"[\s\.\-_]*([1-5]|1st|2nd|3rd|4th|5th|i{1,3}|iv|v)(?:$|[^a-z0-9])"
        )
        m = re.search(pattern, text)
        if m:
            raw_num = m.group(1).lower()
            return ordinal_map.get(raw_num, raw_num)

    # 2. Check directly preceding: e.g. "1st alto sax", "2nd trumpet", "1. trubka", "i. pozoun"
    for kw in family_keywords:
        pattern = (
            r"(?:^|[^a-z0-9])([1-5]|1st|2nd|3rd|4th|5th|i{1,3}|iv|v)[\s\.\-_]*(?:st|nd|rd|th|d|te)?[\s\.\-_]*"
            + re.escape(kw)
            + r"(?:$|[^a-z0-9])"
        )
        m = re.search(pattern, text)
        if m:
            raw_num = m.group(1).lower()
            return ordinal_map.get(raw_num, raw_num)

    return None


def extract_numbers_and_ordinals(text: str) -> list[str]:
    """Finds instrument numbers like '1', '2', '3', '1st', '2nd', '3rd', 'I', 'II', 'III', 'IV'."""
    nums = []
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
    }

    words = re.findall(r"[a-z0-9]+", text.lower())
    for w in words:
        if w in ordinal_map:
            nums.append(ordinal_map[w])
        elif w.isdigit() and int(w) <= 10:
            nums.append(str(int(w)))
    return nums


def match_instrument_name(
    header_text: str, full_page_text: str, band_instruments: list[str]
) -> tuple[str, Optional[str], float]:
    """
    Identifies whether the page text represents 'score', 'part', or 'other',
    and matches it to the best band instrument.
    Returns: (file_type: 'score'|'part'|'other', instrument_name: Optional[str], confidence: float)
    """
    norm_header = normalize_text(header_text)
    norm_full = normalize_text(full_page_text)

    # 1. Check if multiple distinct instrument families appear on this single page -> FULL SCORE!
    detected_families = set()
    for fam in INSTRUMENT_FAMILIES:
        for kw in fam["keywords"]:
            pattern = r"(^|[^a-z0-9])" + re.escape(kw) + r"($|[^a-z0-9])"
            if re.search(pattern, norm_header) or re.search(pattern, norm_full[:600]):
                detected_families.add(fam["family"])
                break

    if len(detected_families) >= 3:
        return "score", None, 0.98

    # 2. Check for explicit Score / Partitura keywords (unless it is piano conductor/vocal)
    is_piano_conductor = any(
        kw in norm_header
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
            if re.search(pattern, norm_header) or re.search(pattern, norm_full[:400]):
                return "score", None, 0.95

    # 3. Check direct exact match with band instruments
    for inst_name in band_instruments:
        norm_inst = normalize_text(inst_name)
        pattern = r"(^|[^a-z0-9])" + re.escape(norm_inst) + r"($|[^a-z0-9])"
        if re.search(pattern, norm_header):
            return "part", inst_name, 1.0

    # 4. Match by instrument families and adjacent number
    for fam in INSTRUMENT_FAMILIES:
        fam_matched = False
        for kw in fam["keywords"]:
            pattern = r"(^|[^a-z0-9])" + re.escape(kw) + r"($|[^a-z0-9])"
            if re.search(pattern, norm_header) or re.search(pattern, norm_full[:400]):
                fam_matched = True
                break

        if fam_matched:
            # Detect instrument index (e.g. 1 in "Alto Sax 1" or "2 Alto Sax 1")
            inst_num_detected = extract_instrument_number_for_family(
                norm_header, fam["keywords"]
            )
            if not inst_num_detected:
                inst_num_detected = extract_instrument_number_for_family(
                    norm_full[:400], fam["keywords"]
                )

            # Check if bass trombone
            is_bass_tbn = fam["family"] == "Trombone" and (
                "bass" in norm_header
                or "basstrombone" in norm_header
                or "basovy" in norm_header
                or "b. tbn" in norm_header
                or "b.tbn" in norm_header
            )

            # Find candidate band instruments belonging to this family
            candidates = []
            for inst_name in band_instruments:
                norm_inst = normalize_text(inst_name)
                if any(
                    re.search(r"(^|[^a-z0-9])" + re.escape(kw) + r"($|[^a-z0-9])", norm_inst)
                    for kw in fam["keywords"]
                ):
                    inst_nums = extract_numbers_and_ordinals(norm_inst)
                    inst_num = inst_nums[0] if inst_nums else None
                    candidates.append({"name": inst_name, "num": inst_num, "norm": norm_inst})

            if candidates:
                if is_bass_tbn:
                    # Prefer "Basový pozoun" or highest numbered trombone / "Pozoun 4"
                    bass_tbn_cand = next(
                        (c for c in candidates if "bas" in c["norm"]), None
                    )
                    if bass_tbn_cand:
                        return "part", bass_tbn_cand["name"], 0.95
                    # Else highest number
                    candidates.sort(
                        key=lambda c: int(c["num"]) if c["num"] and c["num"].isdigit() else 0,
                        reverse=True,
                    )
                    return "part", candidates[0]["name"], 0.9

                if inst_num_detected:
                    exact_num_match = next(
                        (c for c in candidates if c["num"] == inst_num_detected), None
                    )
                    if exact_num_match:
                        return "part", exact_num_match["name"], 0.95

                no_num_candidate = next((c for c in candidates if c["num"] is None), None)
                if no_num_candidate:
                    return "part", no_num_candidate["name"], 0.85
                return "part", candidates[0]["name"], 0.75

    # 5. Check direct match in full page text
    for inst_name in band_instruments:
        norm_inst = normalize_text(inst_name)
        pattern = r"(^|[^a-z0-9])" + re.escape(norm_inst) + r"($|[^a-z0-9])"
        if re.search(pattern, norm_full[:400]):
            return "part", inst_name, 0.9

    return "other", None, 0.0


def segment_pdf(
    pdf_bytes: bytes,
    song_title: str,
    band_instruments: list[dict],
    existing_song_files: list[dict],
) -> list[dict]:
    """
    Parses the PDF, inspects each page's header text, detects instrument/score transitions,
    and groups contiguous pages into clean part segments.
    """
    reader = PdfReader(io.BytesIO(pdf_bytes))
    total_pages = len(reader.pages)
    if total_pages == 0:
        return []

    tracked_inst_names = [
        inst["name"] for inst in band_instruments if inst.get("is_tracked", True)
    ]
    all_band_inst_names = [inst["name"] for inst in band_instruments]
    existing_inst_files = {
        f.get("instrument_name") for f in existing_song_files if f.get("file_type") == "part"
    }
    has_existing_score = any(f.get("file_type") == "score" for f in existing_song_files)

    # Step 1: Extract text and identify type on each page
    page_infos = []
    for idx, page in enumerate(reader.pages):
        raw_text = page.extract_text() or ""
        lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
        header_text = " | ".join(lines[:4]) if lines else ""

        file_type, inst_name, confidence = match_instrument_name(
            header_text, raw_text, all_band_inst_names
        )

        page_infos.append(
            {
                "page_num": idx + 1,  # 1-indexed
                "header_text": header_text,
                "file_type": file_type,
                "instrument_name": inst_name,
                "confidence": confidence,
            }
        )

    # Step 2: Group contiguous pages into segments
    segments = []
    current_segment = None

    for p in page_infos:
        is_new_part = False
        if current_segment is None:
            is_new_part = True
        else:
            curr_type = current_segment["file_type"]
            curr_inst = current_segment["instrument_name"]

            if p["file_type"] == "score":
                if curr_type != "score":
                    is_new_part = True
            elif p["file_type"] == "part" and p["instrument_name"]:
                if curr_type != "part" or curr_inst != p["instrument_name"]:
                    is_new_part = True
            elif p["file_type"] != curr_type:
                is_new_part = True

        if is_new_part:
            if current_segment:
                segments.append(current_segment)

            current_segment = {
                "file_type": p["file_type"],
                "instrument_name": p["instrument_name"],
                "page_start": p["page_num"],
                "page_end": p["page_num"],
                "header_snippet": p["header_text"][:120],
                "confidence": p["confidence"],
            }
        else:
            current_segment["page_end"] = p["page_num"]
            if current_segment["file_type"] == "other" and p["file_type"] != "other":
                current_segment["file_type"] = p["file_type"]
                current_segment["instrument_name"] = p["instrument_name"]
                current_segment["confidence"] = p["confidence"]

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
            seg["title"] = f"Part: {inst_name}"
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
