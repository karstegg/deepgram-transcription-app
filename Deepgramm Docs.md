{
  `path`: `./deepgram_docs_complete.md`,
  `content`: `# Deepgram Documentation - Complete Reference

## Table of Contents
1. [Welcome & Overview](#welcome--overview)
2. [API Overview](#api-overview)
3. [Getting Started](#getting-started)
4. [Pre-recorded Audio Transcription](#pre-recorded-audio-transcription)
5. [Live Streaming Audio](#live-streaming-audio)
6. [Text-to-Speech (Aura)](#text-to-speech-aura)
7. [Whisper Cloud](#whisper-cloud)
8. [Project Management](#project-management)
9. [Advanced Features & Integrations](#advanced-features--integrations)
10. [Self-Hosted Solutions](#self-hosted-solutions)

---

## Welcome & Overview

### Welcome to Deepgram's Docs!

**Voice Agent**
Create agents for contact centers, teaching, drive thrus and more.

**Speech-to-Text**
Transcribe audio for contact centers, medical audio, wearables and more

---

## API Overview

### Deepgram API Overview

Deepgram's APIs allows you to interact with Deepgram programmatically. You can use our APIs to:

- Build a [Voice Agent](/reference/build-a-voice-agent)
- Transcribe & analyze [pre-recorded audio](/reference/listen-file)
- Transcribe [streaming audio](/reference/listen-live)
- Transform [text to speech](/reference/text-to-speech-api)
- Transform [streaming text to speech](/reference/transform-text-to-speech-websocket)
- Analyze [text](/reference/analyze-text)
- Administer your Deepgram account:
  - Manage [projects](/reference/get-projects) and project [members](/reference/get-members)
  - Manage project [invitations](/reference/list-invites)
  - Manage user [scopes](/reference/get-member-scopes)
  - Retrieve billing [balances](/reference/get-all-balances)
  - Retrieve usage [summaries](/reference/get-all-requests)
  - Manage [API keys](/reference/list-keys)
  - Manage [self-hosted distribution credentials](/reference/list-credentials)
  - Retrieve [Model Metadata](https://developers.deepgram.com/reference/get-models)
- Create [Temporary API Tokens](/reference/token-based-auth-api/grant-token)

---

## Getting Started

### Make Your First API Request

Follow these steps to get started with Deepgram and make your first request.

#### Create a Deepgram Account
Before you can use Deepgram, you'll need to [create a Deepgram account](https://console.deepgram.com/signup?jump=keys). Signup is free and includes $200 in free credit and access to all of Deepgram's features!

#### Create a Deepgram API Key
To access Deepgram's API, you'll need to [create a Deepgram API Key](https://console.deepgram.com/signup?jump=keys). Make note of your API Key; you will need it later.

#### Make a Request to the API
Here are several options for trying out the Deepgram API. These examples are meant to help you make a first request to Deepgram; we encourage you to try out one of our Getting Started guides to learn more.

##### Deepgram Playground
Make a request without writing any code! Head to the [Deepgram Playground](https://playground.deepgram.com/?smart_format=true&language=en&model=nova-3) to try out the API. No sign-up required!

##### CURL
Run the following cURL command in your shell. Be sure to replace the `DEEPGRAM_API_KEY` with your own key.

```bash
curl \\
  --request POST \\
  --header 'Authorization: Token YOUR_DEEPGRAM_API_KEY' \\
  --header 'Content-Type: application/json' \\
  --data '{\"url\":\"https://static.deepgram.com/examples/interview_speech-analytics.wav\"}' \\
  --url 'https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true'
```

For more examples using CURL, check out the [Transcribing Pre-Recorded Audio](/docs/transcribing-pre-recorded-audio) guide.

#### Deepgram SDKs
This section will help you get set up to use Deepgram's SDKs. Then you can continue on to one of the Getting Started guides, which demonstrate how to make common API requests with Deepgram's officially supported SDKs.

##### Configure Environment
We provide sample scripts throughout our documentation in the languages of our SDKs and assume you have already configured your development environment. System requirements will vary depending on the programming language you use:

- Node.js: node >= 14.14.37
- Python: python >= 3.10
- .NET: dotnet >= 6.0
- GO: Go >= 1.18

##### Install the SDK
If you intend to use one of Deepgram's SDKs to make your request, you must install it.

Open your terminal, navigate to the location on your drive where you want to create your project, and install the Deepgram SDK.

**Node.js:**
```bash
# Initialize a new application
npm init

# Install the Deepgram Node.js SDK
npm install @deepgram/sdk
```

**Python:**
```bash
# Install the Deepgram Python SDK
pip install deepgram-sdk
```

##### Make a Request with the SDKs
Continue on to one of our Getting Started Guides where you will find language-specific code samples that show you how to make requests to Deepgram with the SDK of your choice:

- [Pre-Recorded Speech to Text](/docs/getting-started-with-pre-recorded-audio)
- [Streaming Speech to Text](/docs/getting-started-with-live-streaming-audio)
- [Text to Speech](/docs/text-to-speech)
- [Audio Intelligence](/docs/audio-intelligence)
- [Text Intelligence](/docs/text-intelligence)

---

## Pre-recorded Audio Transcription

### Getting Started with Pre-recorded Audio

An introduction to getting transcription data from pre-recorded audio files.

This guide will walk you through how to transcribe pre-recorded audio with the Deepgram API. We provide two scenarios to try: transcribe a remote file and transcribe a local file.

Before you start, you'll need to follow the steps in the [Make Your First API Request](/docs/make-your-first-api-request) guide to obtain a Deepgram API key, and configure your environment if you are choosing to use a Deepgram SDK.

#### CURL Examples

##### Remote File CURL Example
```bash
curl \\
  --request POST \\
  --header 'Authorization: Token YOUR_DEEPGRAM_API_KEY' \\
  --header 'Content-Type: application/json' \\
  --data '{\"url\":\"https://static.deepgram.com/examples/interview_speech-analytics.wav\"}' \\
  --url 'https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true'
```

##### Local File CURL Example
```bash
curl \\
  --request POST \\
  --header 'Authorization: Token YOUR_DEEPGRAM_API_KEY' \\
  --header 'Content-Type: audio/wav' \\
  --data-binary @youraudio.wav \\
  --url 'https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true'
```

The above example includes the parameter `model=nova-3`, which tells the API to use Deepgram's latest model. Removing this parameter will result in the API using the default model, which is currently `model=base`.

It also includes Deepgram's [Smart Formatting](/docs/smart-format) feature, `smart_format=true`. This will format currency amounts, phone numbers, email addresses, and more for enhanced transcript readability.

#### SDK Usage

##### Transcribe a Remote File
```javascript
// Node.js Example
const { Deepgram } = require('@deepgram/sdk');

const deepgram = new Deepgram('YOUR_DEEPGRAM_API_KEY');

const source = {
  url: 'https://static.deepgram.com/examples/interview_speech-analytics.wav'
};

deepgram.transcription.preRecorded(source, {
  model: 'nova-3',
  smart_format: true,
})
.then((response) => {
  console.dir(response, { depth: null });
})
.catch((error) => {
  console.error('Error:', error);
});
```

```python
# Python Example
from deepgram import Deepgram

deepgram = Deepgram('YOUR_DEEPGRAM_API_KEY')

source = {
    'url': 'https://static.deepgram.com/examples/interview_speech-analytics.wav'
}

response = deepgram.transcription.prerecorded(source, {
    'model': 'nova-3',
    'smart_format': True,
})

print(response)
```

##### Transcribe a Local File
```javascript
// Node.js Example
const fs = require('fs');
const { Deepgram } = require('@deepgram/sdk');

const deepgram = new Deepgram('YOUR_DEEPGRAM_API_KEY');

const audio = fs.readFileSync('path/to/your/audio.wav');

const source = {
  buffer: audio,
  mimetype: 'audio/wav',
};

deepgram.transcription.preRecorded(source, {
  model: 'nova-3',
  smart_format: true,
})
.then((response) => {
  console.dir(response, { depth: null });
})
.catch((error) => {
  console.error('Error:', error);
});
```

#### Analyzing the Response

When the file is finished processing (often after only a few seconds), you'll receive a JSON response:

```json
{
  \"metadata\": {
    \"transaction_key\": \"deprecated\",
    \"request_id\": \"uuid-request-id\",
    \"sha256\": \"sha256-hash\",
    \"created\": \"2023-10-10T15:30:00.000Z\",
    \"duration\": 30.5,
    \"channels\": 1
  },
  \"results\": {
    \"channels\": [
      {
        \"alternatives\": [
          {
            \"transcript\": \"Hello, this is a sample transcript.\",
            \"confidence\": 0.95,
            \"words\": [
              {
                \"word\": \"hello\",
                \"start\": 0.5,
                \"end\": 1.0,
                \"confidence\": 0.98,
                \"punctuated_word\": \"Hello\"
              }
            ]
          }
        ]
      }
    ]
  }
}
```

In this response, we see:
- **transcript**: the transcript for the audio segment being processed
- **confidence**: a floating point value between 0 and 1 that indicates overall transcript reliability. Larger values indicate higher confidence
- **words**: an object containing each word in the transcript, along with its start time and end time (in seconds) from the beginning of the audio stream, and a confidence value

#### Limits

##### File Size
- The maximum file size is limited to 2 GB
- For large video files, extract the audio stream and upload only the audio to Deepgram. This reduces the file size significantly

##### Rate Limits
**Nova, Base, and Enhanced Models:**
- Maximum of 100 concurrent requests per project
- For information on Deepgram's Concurrency Rate Limits, refer to our [API Rate Limits Documentation](/reference/api-rate-limits)

**Whisper Model:**
- Paid plan: 15 concurrent requests
- Pay-as-you-go plan: 5 concurrent requests

Exceeding these limits will result in a 429: Too Many Requests error.

##### Maximum Processing Time
**Fast Transcription Models (Nova, Base, and Enhanced)**
- These models offer extremely fast transcription
- Maximum processing time: 10 minutes

**Slower Transcription Model (Whisper)**
- Whisper transcribes more slowly compared to other models
- Maximum processing time: 20 minutes

**Timeout Policy**
- If a request exceeds the maximum processing time, it will be canceled
- In such cases, a 504: Gateway Timeout error will be returned

---

## Live Streaming Audio

### Getting Started with Live Streaming Audio

An introduction to getting transcription data from live streaming audio in real time.

In this guide, you'll learn how to automatically transcribe live streaming audio in real time using Deepgram's SDKs, which are supported for use with the Deepgram API.

Before you start, you'll need to follow the steps in the [Make Your First API Request](/docs/make-your-first-api-request) guide to obtain a Deepgram API key, and configure your environment if you are choosing to use a Deepgram SDK.

#### SDK Usage for Live Streaming

```javascript
// Node.js Example
const { Deepgram } = require('@deepgram/sdk');

const deepgram = new Deepgram('YOUR_DEEPGRAM_API_KEY');

const liveTranscription = deepgram.transcription.live({
  model: 'nova-3',
  language: 'en-US',
  smart_format: true,
  interim_results: true,
});

liveTranscription.addListener('open', () => {
  console.log('Connection opened');
});

liveTranscription.addListener('transcriptReceived', (transcription) => {
  console.log('Received:', transcription);
});

liveTranscription.addListener('error', (error) => {
  console.error('Error:', error);
});

// Start the connection
liveTranscription.start();

// Send audio data (example with microphone input)
// This is where you would stream your audio data
// liveTranscription.send(audioChunk);
```

```python
# Python Example
import asyncio
from deepgram import Deepgram

async def main():
    deepgram = Deepgram('YOUR_DEEPGRAM_API_KEY')
    
    dg_connection = deepgram.transcription.live({
        'model': 'nova-3',
        'language': 'en-US',
        'smart_format': True,
        'interim_results': True,
    })
    
    async def on_message(self, result, **kwargs):
        transcript = result['channel']['alternatives'][0]['transcript']
        if len(transcript) > 0:
            print(f\"Transcript: {transcript}\")
    
    dg_connection.registerHandler(dg_connection.event.TRANSCRIPT_RECEIVED, on_message)
    
    # Start the connection
    await dg_connection.start()
    
    # Send audio data here
    # await dg_connection.send(audio_chunk)

if __name__ == \"__main__\":
    asyncio.run(main())
```

#### Understanding Live Streaming Results

The responses that are returned will look similar to this:

```json
{
  \"channel\": {
    \"alternatives\": [
      {
        \"transcript\": \"Hello there\",
        \"confidence\": 0.95,
        \"words\": [
          {
            \"word\": \"hello\",
            \"start\": 0.5,
            \"end\": 1.0,
            \"confidence\": 0.98,
            \"punctuated_word\": \"Hello\"
          }
        ]
      }
    ]
  },
  \"is_final\": true,
  \"speech_final\": true
}
```

Key fields:
- **confidence**: a floating point value between 0 and 1 that indicates overall transcript reliability
- **words**: an object containing each word in the transcript, along with its start time and end time
- **is_final**: indicates if this is the final result for this audio segment
- **speech_final**: indicates if the speaker has finished speaking

#### What's Next?

Now that you've gotten transcripts for streaming audio, enhance your knowledge by exploring the following areas:

- **Language**: Learn how to transcribe audio in other languages
- **Feature Overview**: Review the list of features available for streaming speech-to-text
- **End of speech detection**: Learn how to pinpoint end of speech post-speaking more effectively
- **Using interim results**: Learn how to use preliminary results provided during the streaming process
- **Measuring streaming latency**: Learn how to measure latency in real-time streaming of audio

---

## Text-to-Speech (Aura)

### Getting Started with Text-to-Speech

An introduction to using Deepgram's Aura Text-to-Speech REST API to convert text into audio.

This guide will walk you through how to turn text into speech with Deepgram's text-to-speech REST API.

Before you start, you'll need to follow the steps in the [Make Your First API Request](/docs/make-your-first-api-request) guide to obtain a Deepgram API key, and configure your environment if you are choosing to use a Deepgram SDK.

#### API Playground
First, quickly explore Deepgram Text to Speech in our [API Playground](https://playground.deepgram.com/?endpoint=speak)!

#### CURL Example

```bash
curl \\
  --request POST \\
  --header 'Authorization: Token YOUR_DEEPGRAM_API_KEY' \\
  --header 'Content-Type: application/json' \\
  --data '{\"text\": \"Hello, how can I help you today?\"}' \\
  --url 'https://api.deepgram.com/v1/speak?model=aura-asteria-en' \\
  --output tts.mp3
```

This will result in an MP3 audio file being streamed back to you by Deepgram. You can play the audio as soon as you receive the first byte, or you can wait until the entire MP3 file has arrived.

The audio file will contain the voice of the selected model saying the words that you sent in your request.

If you do not specify a `model`, the default voice model `aura-asteria-en` will be used. You can find all of our available voices [here](/docs/tts-models).

#### Send Error Messages to Terminal

If your request results in an error, the error message can be seen by opening the output audio file in a text editor.

To see the error message in your terminal, add this to your CURL request:

```bash
curl \\
  --request POST \\
  --header 'Authorization: Token YOUR_DEEPGRAM_API_KEY' \\
  --header 'Content-Type: application/json' \\
  --data '{\"text\": \"Hello, how can I help you today?\"}' \\
  --url 'https://api.deepgram.com/v1/speak?model=aura-asteria-en' \\
  --output tts.mp3 \\
  --write-out '%{http_code}' \\
  --silent \\
  --show-error \\
  --fail \\
  || (cat tts.mp3 | jq -r '.message' && rm tts.mp3)
```

#### SDK Usage

```javascript
// Node.js Example
const { Deepgram } = require('@deepgram/sdk');
const fs = require('fs');

const deepgram = new Deepgram('YOUR_DEEPGRAM_API_KEY');

const text = \"Hello, how can I help you today?\";

deepgram.speak({
  text: text,
  model: 'aura-asteria-en',
})
.then((response) => {
  // Save the audio file
  fs.writeFileSync('output.mp3', response.buffer);
  console.log('Audio file saved as output.mp3');
})
.catch((error) => {
  console.error('Error:', error);
});
```

```python
# Python Example
from deepgram import Deepgram

deepgram = Deepgram('YOUR_DEEPGRAM_API_KEY')

text = \"Hello, how can I help you today?\"

response = deepgram.speak({
    'text': text,
    'model': 'aura-asteria-en',
})

# Save the audio file
with open('output.mp3', 'wb') as f:
    f.write(response.content)

print('Audio file saved as output.mp3')
```

#### Response Headers

Upon successful processing of the request, you will receive an audio file containing the synthesized text-to-speech output, along with response headers providing additional information.

The audio file is streamed back to you, so you may begin playback as soon as the first byte arrives.

Example response headers:
- **content-type**: Specifies the media type of the resource, in this case, `audio/mpeg`
- **dg-request-id**: A unique identifier for the request, useful for debugging and tracking purposes
- **dg-model-uuid**: The unique identifier of the model that processed the request
- **dg-char-count**: Indicates the number of characters that were in the input text
- **dg-model-name**: The name of the model used to process the request
- **transfer-encoding**: Specifies the form of encoding used to safely transfer the payload
- **date**: The date and time the response was sent

#### Limits

##### Input Text Limit
- Maximum characters: 2000
- Sending a text payload longer than 2000 characters (2001 or more) will result in an error, and the audio file will not be created

##### Rate Limits
- Concurrency Rate Limits apply
- If the number of in-progress requests for a project meets or exceeds the rate limit, new requests will receive a 429: Too Many Requests error
- For suggestions on handling Concurrency Rate Limits, refer to our [Working with Concurrency Rate Limits Documentation](/docs/working-with-concurrency-rate-limits) guide

---

## Whisper Cloud

### Getting Started with Deepgram Whisper Cloud

Deepgram Whisper Cloud is a fully managed API that gives you access to Deepgram's version of OpenAI's Whisper model.

#### Benefits of Using Deepgram's Whisper Cloud

Using Deepgram's fully hosted Whisper Cloud instead of running your own version provides many benefits:

- Pairing the Whisper model with Deepgram features that you can't get using the OpenAI speech-to-text API, such as diarization and word timings
- Support for all Whisper model sizes: tiny, base, small, medium, and large
- Support for up to 5 concurrent requests for the Pay As You Go and Growth plans

**Important Notes:**
- Deepgram hosts and maintains these Whisper models; they aren't hosted or run by OpenAI
- Data sent through API requests for our Whisper models will not be sent to OpenAI
- Live streaming is not available with Deepgram Whisper Cloud. If you would like to transcribe live streamed audio, we recommend using our Nova-3 model

#### Getting Started

##### Create a Deepgram Account
Before you can use Deepgram, you'll need to [create a Deepgram account](https://console.deepgram.com/signup?jump=keys). Signup is free and includes $200 in free credit and access to all of Deepgram's features!

##### Transcribe a Remote File

```bash
curl \\
  --request POST \\
  --header 'Authorization: Token YOUR_DEEPGRAM_API_KEY' \\
  --header 'Content-Type: application/json' \\
  --data '{\"url\":\"https://static.deepgram.com/examples/interview_speech-analytics.wav\"}' \\
  --url 'https://api.deepgram.com/v1/listen?model=whisper'
```

If you would like to use a Deepgram SDK to make the request, follow the steps in the [Pre-Recorded speech-to-text](/docs/getting-started-with-pre-recorded-audio) guide, but change the model to `whisper`.

#### Enable Whisper Model and Sizes

To enable Deepgram's Whisper API, add a model parameter in the query string and set it to `model=whisper`

To enable a specific size of the Whisper model, set the model parameter to `model=whisper-size`.

If `model=whisper` is supplied and no model size specified, the model size will default to `model=whisper-medium`.

Available Deepgram Whisper Cloud models:
- `model=whisper` (defaults to whisper-medium)
- `model=whisper-tiny`
- `model=whisper-base`
- `model=whisper-small`
- `model=whisper-medium`
- `model=whisper-large` (defaults to large-v2)

#### Language Detection

Deepgram Whisper Cloud supports language detection, which means just by setting `detect_language=true`, your audio will be transcribed in the detected language.

#### Supported Languages

Officially supported languages include: Afrikaans, Arabic, Armenian, Azerbaijani, Belarusian, Bosnian, Bulgarian, Catalan, Chinese, Croatian, Czech, Danish, Dutch, English, Estonian, Finnish, French, Galician, German, Greek, Hebrew, Hindi, Hungarian, Icelandic, Indonesian, Italian, Japanese, Kannada, Kazakh, Korean, Latvian, Lithuanian, Macedonian, Malay, Marathi, Maori, Nepali, Norwegian, Persian, Polish, Portuguese, Romanian, Russian, Serbian, Slovak, Slovenian, Spanish, Swahili, Swedish, Tagalog, Tamil, Thai, Turkish, Ukrainian, Urdu, Vietnamese, and Welsh.

Languages supported by whisper include: `en`, `zh`, `de`, `es`, `ru`, `ko`, `fr`, `ja`, `pt`, `tr`, `pl`, `ca`, `nl`, `ar`, `sv`, `it`, `id`, `hi`, `fi`, `vi`, `he`, `uk`, `el`, `ms`, `cs`, `ro`, `da`, `hu`, `ta`, `no`, `th`, `ur`, `hr`, `bg`, `lt`, `la`, `mi`, `ml`, `cy`, `sk`, `te`, `fa`, `lv`, `bn`, `sr`, `az`, `sl`, `kn`, `et`, `mk`, `br`, `eu`, `is`, `hy`, `ne`, `mn`, `bs`, `kk`, `sq`, `sw`, `gl`, `mr`, `pa`, `si`, `km`, `sn`, `yo`, `so`, `af`, `oc`, `ka`, `be`, `tg`, `sd`, `gu`, `am`, `yi`, `lo`, `uz`, `fo`, `ht`, `ps`, `tk`, `nn`, `mt`, `sa`, `lb`, `my`, `bo`, `tl`, `mg`, `as`.

#### Caveats

- It's important to understand that Whisper models are less scalable than all other Deepgram models due to their inherent model architecture
- Deepgram's non-Whisper models will return results faster and scale to a higher load, so we recommend using a Deepgram model such as Nova if it can meet your needs
- There is a 10 minute timeout for all Deepgram models. Transcription requests that run longer than 10 minutes will return a 504 error

---

## Project Management

### Managing Projects

Learn about Deepgram Projects, which organize all of your Deepgram resources and consist of a set of users, a set of API Keys, and billing and monitoring settings.

#### Understanding Projects

Your Deepgram account is structured into projects. Each project consists of:
- A set of users
- A set of API keys
- Billing and monitoring for Deepgram Services

Projects in Deepgram are completely distinct environments with no connection to one another. Projects have unique access to Deepgram models, features, and services.

When you sign up, we automatically create a Project for you. Any promotional credit you have earned is attached to this first project. If you would like to transfer your promotional balance to a new project, contact Support.

#### Team Members and Roles

After you have created a Project, you can invite Team Members who you can let:
- Create transcripts for your Project
- Monitor Project balances and usage
- Manage other Team Members and create API Keys

You control what actions a Team Member can perform by assigning them a Role.

When you invite a Team Member, you assign them a Role, which determines which actions they can perform in the associated Project. Deepgram uses a tiered system of access control to provide granular access to its endpoints.

##### To invite a Team Member:
1. Log in to the Deepgram Console
2. From the Projects dropdown on the top-left, select the Project to which you want to invite a Team Member
3. Select Settings
4. Select the Team Members view
5. Select Invite New Member
6. Enter the required settings and select Send Invites

#### API Key Management

Deepgram's API uses API Keys to authenticate requests. You can view and manage your API Keys in the Deepgram Console or through the Deepgram API.

**Important Security Notes:**
- Your API keys grant many privileges, so be sure to keep them secure
- Do not share your secret API keys in publicly accessible areas such as GitHub or client-side code
- For best results, use different API Keys for testing and production
- To help filter usage, you can also use different API Keys for different consumers or teams at your organization

**Key Points:**
- API keys are generated by an account within the scope of a specific project
- To continue using the API key, the account that created it must remain part of that project
- The key cannot be used outside the context of its original project
- If the account that created the key is removed from the project or deleted, the API key becomes invalid
- When you create an API Key, you assign it a Role, which determines which actions it can be used to perform

##### To delete an API Key:
1. Log in to the Deepgram Console
2. From the Projects dropdown on the top-left, select the Project in which you want to delete an API Key
3. Select Settings
4. Select the API Keys view
5. Locate the API Key to delete, and select the associated trash can icon

#### Credits and Billing

Projects are assigned credits, which determine how many transactions can be performed for the associated Project.

**Credit Expiration:**
- Credits associated with an enterprise contract expire at the end of the contract period
- Deepgram free promotional credits expire one year from signup
- Credits purchased by individuals using a credit card do not expire

If you would like to transfer your credit balance to another project, contact Support. When credits are transferred, any associated expiration date also transfers.

---

## Advanced Features & Integrations

### Summarization

Summarization provides a brief summary of the audio.

Deepgram's Summarization feature summarizes the content of the submitted audio and returns a brief summary in the JSON response.

To enable Summarization V2, use the following parameter in the query string when you call Deepgram's `/listen` endpoint:

```
summarize=v2
```

#### Usage Example

```bash
curl \\
  --request POST \\
  --header 'Authorization: Token YOUR_DEEPGRAM_API_KEY' \\
  --header 'Content-Type: application/json' \\
  --data '{\"url\":\"https://static.deepgram.com/examples/interview_speech-analytics.wav\"}' \\
  --url 'https://api.deepgram.com/v1/listen?model=nova-3&summarize=v2'
```

#### Requirements and Limitations

- Summarization V2 (`summarize=v2`) requires a minimum of greater than 50 words for summarization
- For shorter inputs (less than 50 words), the original input will be returned
- In cases where summarization cannot be performed, no tokens in or out are billed as summarization usage

### Twilio Integration

A starter server and a self-hosted solution for integrating speech-to-text with Twilio and Deepgram.

#### Deployment Options

To help you integrate between Twilio and Deepgram, we provide the following solutions:

1. **Starter server** in either Python or Node
   - A conversation streamed to your Twilio number will be directed to our script
   - The script will send the audio to Deepgram, and receive and print transcriptions to the screen
   - In a real implementation, you will likely want to provide a callback to which transcriptions can be sent

2. **Docker image** (`deepgram/twilio-proxy:beta`)
   - Fully integrates with our self-hosted products using the same robust Rust architecture that our other services use
   - For access to the Docker image, ask your Account Executive

#### Setup Process

Before you start, you'll need to:
1. Follow the steps in the [Make Your First API Request](/docs/make-your-first-api-request) guide to obtain a Deepgram API key
2. Configure your environment if you are choosing to use a Deepgram SDK

To use the Docker Image, you must configure Twilio to forward data to the server serving the Rust program. To do this, see the \"Start Streaming Audio\" section of Twilio's tutorial: \"Consume a real-time Media Stream using WebSockets, Python, and Flask\".

In this tutorial, you will use TwiML Bins, a serverless solution that helps you provide Twilio-hosted instructions to your Twilio applications, to begin streaming your call's audio.

When calling your Twilio number, the call will be forwarded to the number you set in your TwiML Bin. The conversation will then be forked to the Twilio-Deepgram proxy app, which will send the audio to Deepgram, receive transcriptions, and print the transcriptions to the screen.

---

## Self-Hosted Solutions

### Self Service Licensing & Credentials

This guide focuses on using Deepgram Console for self-hosted product management. If you would like to use the Deepgram API, see our API documentation on creating API keys and creating distribution credentials.

#### Prerequisites

This guide only applies to Console projects which have been granted access to self-hosted products. If you have access, your Console menu should have a \"Self-Hosted\" tab.

If you do not have this tab in Console, your project has either:
- Not received access to managed self-hosted products
- Received access to managed self-hosted products, but has not yet been granted access to self-service for these products

To take advantage of our self-hosted product offering, you will need to enroll in a Deepgram Enterprise Plan. If you're interested, please contact us!

#### Creating API Keys for Self-Hosted Products

You can use the Deepgram Console or the Deepgram API to create a self-hosted API key for licensing Deepgram products.

Follow the [Creating API Keys](/docs/creating-api-keys) guide to create a key, and record it securely. After receiving your key, you can dismiss the pop-up and return to the API Keys page.

You should see your new self-hosted API key, and if you expand the details, you can view the self-hosted products which can be licensed by that key.

Depending on your self-hosted agreement with Deepgram, you may have access to different products:
- All self-hosted customers have access to API and Engine
- For access to the License Proxy, please contact Support

#### Distribution Credentials

Distribution credentials are used to authenticate with a container image repository.

#### Migration from Legacy Systems

If you are deploying Deepgram to your environment for the first time, you may skip this section and proceed to the next guide.

If your self-hosted Deepgram environment uses a static legacy license key, or you previously used DockerHub to access container images, you will need to modify your environment to use your newly generated credentials.

##### Checking Your Current Setup

To check if you are currently pulling images from DockerHub and need to migrate to Quay, check your deployment files. Depending on your container orchestrator, this may be a Docker Compose file, a Podman Compose file, Kubernetes manifest files, or a Helm chart.

If your image tags look like any of the following, you are pulling from DockerHub and must migrate to Quay:
- `deepgram/api:latest`
- `deepgram/engine:latest`
- `deepgram/license-proxy:latest`

If your image tags have the prefix `quay.io`, you are already using Quay and do not need to migrate.

##### Migration Steps

1. Replace your static legacy license key with your newly generated self-hosted API key
2. Edit any custom `api.toml` and `engine.toml` configuration files
3. Replace the value at `[license.key]` with your API key secret
4. If needed, edit the `docker-compose.yml` file (or other orchestration platform files) to replace the key used by the License Proxy or other add-on products
5. Replace the value at `--license-key` with your API key secret

---

## Additional Resources

### Feature Overview

Deepgram provides numerous features to customize your transcription and audio processing:

#### Speech-to-Text Features
- **Language Detection**: Automatically detect the language being spoken
- **Smart Formatting**: Format currency amounts, phone numbers, email addresses, and more
- **Profanity Filtering**: Remove profanity from transcripts
- **Redaction**: Redact sensitive information like credit card numbers
- **Diarization**: Identify different speakers in the audio
- **Word-level timestamps**: Get precise timing for each word
- **Confidence scores**: Understand the reliability of transcription results

#### Text-to-Speech Features
- **Multiple voice models**: Choose from various AI-generated voices
- **Custom audio formats**: Control the output audio format and quality
- **Streaming output**: Begin playback as soon as the first byte arrives
- **Callback support**: Process audio asynchronously via callbacks

#### Audio Intelligence
- **Summarization**: Generate brief summaries of audio content
- **Topic Detection**: Identify key topics discussed in the audio
- **Intent Recognition**: Understand the intent behind spoken words
- **Sentiment Analysis**: Analyze the emotional tone of speech

### Use Cases

Deepgram's technology serves various industries and applications:

#### Contact Centers
- Real-time call transcription
- Quality assurance and monitoring
- Sentiment analysis for customer interactions
- Automated call summarization

#### Medical and Healthcare
- Medical dictation and transcription
- Patient interaction recording
- Clinical note generation
- Compliance and documentation

#### Media and Entertainment
- Podcast transcription and searchability
- Video content captioning
- Live event transcription
- Content accessibility

#### Education
- Lecture transcription and note-taking
- Language learning applications
- Accessibility for hearing-impaired students
- Automated assessment tools

#### Wearables and IoT
- Voice command processing
- Health monitoring applications
- Smart home integrations
- Fitness and wellness tracking

### Support and Community

#### Getting Help
- **Documentation**: Comprehensive guides and API references
- **Support Team**: Contact support for technical assistance
- **Community**: Join the Deepgram developer community
- **Tutorials**: Step-by-step guides for common use cases

#### API Playground
Test Deepgram's features without writing code using our [API Playground](https://playground.deepgram.com/).

#### GitHub Resources
- **SDKs**: Official SDKs for Node.js, Python, .NET, and Go
- **Code Samples**: Example implementations in various languages
- **Starter Apps**: Complete applications demonstrating Deepgram integration

---

*This documentation provides a comprehensive overview of Deepgram's APIs and features. For the most up-to-date information and detailed API references, visit [developers.deepgram.com](https://developers.deepgram.com).*`
}