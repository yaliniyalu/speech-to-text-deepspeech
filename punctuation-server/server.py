import logging
import sys, json

from dbpunctuator.inference import Inference, InferenceArguments
from dbpunctuator.utils import ALL_PUNCS, DEFAULT_ENGLISH_TAG_PUNCTUATOR_MAP
from dbpunctuator.utils.utils import register_logger

logger = logging.getLogger(__name__)
register_logger(logger)

def produce_sample_text(text, repl=None):
    puncs = dict(zip(ALL_PUNCS, [repl] * len(ALL_PUNCS)))
    return text.lower().translate(puncs)

def is_json(json_str):
    try:
        json.loads(json_str)
    except ValueError as e:
        return False
    return True

if __name__ == "__main__":
    args = InferenceArguments(
        model_name_or_path="Qishuai/distilbert_punctuator_en",
        tokenizer_name="Qishuai/distilbert_punctuator_en",
        tag2punctuator=DEFAULT_ENGLISH_TAG_PUNCTUATOR_MAP,
    )

    inference = Inference(inference_args=args, verbose=False)

    while True:
        json_text = sys.stdin.readline()
        if not json_text or not json_text.strip() or not is_json(json_text):
            continue

        data = json.loads(json_text)
        text = [data['text']]
        result = inference.punctuation(text)
        print(json.dumps({"text": result[0][0], "punctuations": result[1][0], "id": data['id']}))
