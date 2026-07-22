import re

def words_to_digits(text: str) -> str:
    """
    Converts Russian number words to digits in a string.
    Example: "двадцать пять" -> "25"
    For time expressions after "в", keeps hour and minutes separate:
    "в шесть двадцать восемь" -> "в 6 28" (not "в 34")
    "в двадцать четыре девять" -> "в 24 9" (not "в 33")
    """
    if not text:
        return text

    units = {
        "ноль": 0, "один": 1, "одна": 1, "два": 2, "две": 2, "три": 3, "четыре": 4, "пять": 5, "шесть": 6, "семь": 7, "восемь": 8, "девять": 9,
        "десять": 10, "одиннадцать": 11, "двенадцать": 12, "тринадцать": 13, "четырнадцать": 14, "пятнадцать": 15, "шестнадцать": 16, "семнадцать": 17, "восемнадцать": 18, "девятнадцать": 19
    }
    tens = {
        "двадцать": 20, "тридцать": 30, "сорок": 40, "пятьдесят": 50, "шестьдесят": 60, "семьдесят": 70, "восемьдесят": 80, "девяносто": 90
    }
    hundreds = {
        "сто": 100, "двести": 200, "триста": 300, "четыреста": 400, "пятьсот": 500, "шестьсот": 600, "семьсот": 700, "восемьсот": 800, "девятьсот": 900
    }
    thousands = {
        "тысяча": 1000, "тысячи": 1000, "тысяч": 1000
    }

    all_num_words = list(units.keys()) + list(tens.keys()) + list(hundreds.keys()) + list(thousands.keys())

    def _parse_compound(words_list):
        """Parse a list of number words into a single number (e.g. ['двадцать', 'четыре'] → 24)."""
        total = 0
        for w in words_list:
            if w in units: total += units[w]
            elif w in tens: total += tens[w]
            elif w in hundreds: total += hundreds[w]
            elif w in thousands:
                if total == 0: total = 1
                total *= 1000
        return total

    words = text.split()
    new_words = []
    i = 0
    while i < len(words):
        word = words[i].lower().strip(".,!?")
        if word in all_num_words:
            is_time_context = (len(new_words) > 0 and new_words[-1].lower() == "в")

            # Collect all number words in this sequence
            j = i
            num_words = []
            while j < len(words):
                w = words[j].lower().strip(".,!?")
                if w in units or w in tens or w in hundreds or w in thousands:
                    num_words.append(w)
                    j += 1
                else:
                    break

            if is_time_context and len(num_words) >= 1:
                # Time context: try hour:minutes split
                # Collect ALL valid splits, prefer longest hour (most specific)
                best_result = None
                for k in range(1, len(num_words) + 1):
                    hour_candidate = _parse_compound(num_words[:k])
                    if not (1 <= hour_candidate <= 23):
                        continue
                    min_candidate = _parse_compound(num_words[k:]) if num_words[k:] else 0
                    min_candidate = min(min_candidate, 59)
                    if min_candidate > 0:
                        # Valid hour+minutes — prefer longer hour (more specific)
                        if best_result is None or k > best_result[2]:
                            best_result = (hour_candidate, min_candidate, k)
                    elif best_result is None:
                        best_result = (hour_candidate, 0, k)

                if best_result is None:
                    # No valid hour≤23 — treat entire as single number
                    total = _parse_compound(num_words)
                    total = min(total, 23)
                    new_words.append(str(total))
                else:
                    hour_val, min_val, _ = best_result
                    hour_val = hour_val % 24
                    new_words.append(str(hour_val))
                    if min_val > 0:
                        new_words.append(str(min_val))
            else:
                # Non-time context: sum all number words
                total = _parse_compound(num_words)
                new_words.append(str(total))

            i = j
            continue

        new_words.append(words[i])
        i += 1

    return " ".join(new_words)
