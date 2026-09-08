import type { CorpusMessage } from './cache'
import { buildClassifierSystemPrompt, buildClassifierUserPrompt } from './prompt'
import {
  CLASSIFIER_MODEL,
  CLASSIFIER_OUTPUT_FIELDS,
  classifierJsonSchemaForFields,
  outputToClassification,
} from './schema'
import type { ClassifierOutput, ClassifierOutputField, PartialClassifierOutput } from './schema'
import { sha256Hex } from './hash'

type Fetch = typeof fetch

interface ResponsesApiTextContent {
  type: 'output_text'
  text: string
}

interface ResponsesApiMessage {
  type: 'message'
  content: [ResponsesApiTextContent]
}

interface ResponsesApiResult {
  output: ResponsesApiMessage[]
  usage?: OpenAIUsage
}

export interface OpenAIUsage {
  input_tokens: number
  output_tokens: number
  total_tokens: number
}

export interface OpenAIClassificationResult {
  classification: ReturnType<typeof outputToClassification>
  usage: OpenAIUsage
}

export interface OpenAIFieldClassificationResult {
  output: PartialClassifierOutput
  usage: OpenAIUsage
}

function parseResponsesApiText(result: ResponsesApiResult): string {
  const text = result.output
    .flatMap((item) => item.content)
    .find((content) => content.type === 'output_text')?.text
  if (text === undefined) throw new Error('OpenAI response did not include output_text.')
  return text
}

export async function classifyWithOpenAIResult(
  message: CorpusMessage,
  options: {
    apiKey: string
    installId: string
    fetchImpl?: Fetch
  },
) {
  const response = await classifyFieldsWithOpenAIResult(message, {
    ...options,
    fields: CLASSIFIER_OUTPUT_FIELDS,
  })
  return {
    classification: outputToClassification(response.output as ClassifierOutput),
    usage: response.usage,
  }
}

export async function classifyFieldsWithOpenAIResult(
  message: CorpusMessage,
  options: {
    apiKey: string
    installId: string
    fields: readonly ClassifierOutputField[]
    fetchImpl?: Fetch
  },
): Promise<OpenAIFieldClassificationResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${options.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: CLASSIFIER_MODEL,
      safety_identifier: sha256Hex(options.installId),
      reasoning: { effort: 'minimal' },
      input: [
        { role: 'system', content: buildClassifierSystemPrompt(options.fields) },
        { role: 'user', content: buildClassifierUserPrompt(message.text) },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'serenity_classification_v1',
          strict: true,
          schema: classifierJsonSchemaForFields(options.fields),
        },
      },
      max_output_tokens: 500,
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI request failed with HTTP ${response.status}: ${await response.text()}`)
  }

  const result = (await response.json()) as ResponsesApiResult
  const output = JSON.parse(parseResponsesApiText(result)) as PartialClassifierOutput
  if (result.usage === undefined) throw new Error('OpenAI response did not include usage.')
  return { output, usage: result.usage }
}

export async function classifyWithOpenAI(
  message: CorpusMessage,
  options: {
    apiKey: string
    installId: string
    fetchImpl?: Fetch
  },
) {
  return (await classifyWithOpenAIResult(message, options)).classification
}
