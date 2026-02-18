import { createErrorHandler } from '@rxjs-spa/errors'

export const [errorHandler, errorSub] = createErrorHandler({
  enableGlobalCapture: true,
  onError: (e) =>
    console.error(`[${e.source}]${e.context ? ` ${e.context}:` : ''} ${e.message}`),
})
