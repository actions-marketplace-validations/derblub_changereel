"""Speak sentences with Kokoro and say when each word is spoken.

Run by narrate.mjs with the Python that Kokoro is installed in:

    python speak_kokoro.py --voice af_heart < sentences.json

Reads a list of {"text", "output"} as JSON, writes each sentence into its WAV file and prints
one line of JSON: for every sentence its length in seconds and, for every word as it is
written, when the voice starts and ends it. All sentences in one run, because loading the
model takes longer than speaking a sentence.
"""

import argparse
import json
import sys
import wave

import numpy as np
from kokoro import KPipeline

RATE = 24000


def spoken_words(tokens, offset):
    """[start, end] in seconds of every word Kokoro says, where words are split by spaces."""
    words = []
    current = None
    for token in tokens:
        if token.start_ts is not None:
            start, end = offset + token.start_ts, offset + token.end_ts
            current = [start, end] if current is None else [current[0], end]
        # A comma or a quote has no time of its own: it belongs to the word it is part of
        if token.whitespace and current is not None:
            words.append(current)
            current = None
    if current is not None:
        words.append(current)
    return words


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--voice", required=True)
    args = parser.parse_args()
    items = json.load(sys.stdin)

    # The first letter of a voice is its language: a for American English, b for British
    pipeline = KPipeline(lang_code=args.voice[0], repo_id="hexgrad/Kokoro-82M")
    told = []
    for item in items:
        text = item["text"].strip()
        chunks = []
        spoken = []
        samples = 0
        for result in pipeline(text, voice=args.voice, split_pattern=None):
            if result.audio is None:
                continue
            audio = result.audio.numpy()
            spoken += spoken_words(result.tokens or [], samples / RATE)
            chunks.append(audio)
            samples += len(audio)
        audio = np.concatenate(chunks) if chunks else np.zeros(0, dtype=np.float32)
        with wave.open(item["output"], "wb") as out:
            out.setnchannels(1)
            out.setsampwidth(2)
            out.setframerate(RATE)
            out.writeframes((np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes())

        written = text.split()
        words = []
        # Only when the count comes out: otherwise every word after the first slip is wrong
        if len(spoken) == len(written):
            words = [{"text": word, "start": round(start, 3), "end": round(end, 3)} for word, (start, end) in zip(written, spoken)]
        told.append({"seconds": samples / RATE, "words": words})
    print(json.dumps(told))


if __name__ == "__main__":
    main()
