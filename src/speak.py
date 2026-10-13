"""Speak a sentence with Piper and say when each word is spoken.

Run by narrate.mjs with the Python that Piper is installed in:

    python speak.py --model voice.onnx --output sentence.wav < sentence.txt

Writes the WAV file and prints one line of JSON: the length in seconds and, for every word
as it is written, when the voice starts and ends it. Piper tells how many samples each
sound takes; the sounds of a word are found by counting: "599" is written as one word and
spoken as three, and Piper says so when it is asked for that word alone.
"""

import argparse
import json
import sys
import wave

from piper import PiperVoice

# What Piper puts around and between the sounds of words
MARKS = set("^$_.,;:!?¡¿—…\"«»“” ")


def groups_of(voice, text):
    """The spoken words of a text: lists of sounds, split where the voice puts a space."""
    groups = []
    for sentence in voice.phonemize(text):
        current = []
        for sound in sentence:
            if sound == " ":
                if current:
                    groups.append(current)
                current = []
            elif sound not in MARKS:
                current.append(sound)
        if current:
            groups.append(current)
    return groups


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    text = sys.stdin.read().strip()

    # Patches the voice in memory so that it tells the length of each sound (needs onnx)
    voice = PiperVoice.load(args.model, include_alignments=True)
    spoken = []  # [start, end] in samples of every spoken word, in order
    samples = 0
    rate = voice.config.sample_rate
    aligned = True
    with wave.open(args.output, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        for chunk in voice.synthesize(text, include_alignments=True):
            out.writeframes(chunk.audio_int16_bytes)
            at = samples
            start = None
            if chunk.phoneme_alignments is None:
                aligned = False
            for sound in chunk.phoneme_alignments or []:
                if sound.phoneme == " " or sound.phoneme in MARKS:
                    if start is not None:
                        spoken.append([start, at])
                        start = None
                elif start is None:
                    start = at
                at += sound.num_samples
            if start is not None:
                spoken.append([start, at])
            samples += len(chunk.audio_int16_bytes) // 2

    words = []
    if aligned:
        written = text.split()
        counts = [len(groups_of(voice, word)) for word in written]
        # Only when the count comes out: otherwise every word after the first slip is wrong
        if sum(counts) == len(spoken):
            at = 0
            last = 0.0
            for word, count in zip(written, counts):
                if count:
                    start = spoken[at][0] / rate
                    last = spoken[at + count - 1][1] / rate
                    at += count
                else:  # a sign the voice does not say: it takes no time
                    start = last
                words.append({"text": word, "start": round(start, 3), "end": round(last, 3)})
    print(json.dumps({"seconds": samples / rate, "words": words}))


if __name__ == "__main__":
    main()
