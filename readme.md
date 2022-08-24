## Speech to text - Deepspeech

This project works only on **node v15.14.0**. You can use `nvm` to manage node versions.

### Installation
1. Copy `.env.example` to `.env` and fill in the values
2. Download the deepspeech model from [here](https://github.com/mozilla/DeepSpeech/releases/tag/v0.9.3)
3. Extract the model and set path in `.env` file
4. Run python requirements `pip install -r requirements.txt` in punctuation-server
5. Run `yarn install`
6. Run `yarn run dev`
