export interface IntegrationProvider {
  id: string
  enabled: boolean
  testConnection: () => Promise<{ ok: boolean; error?: string }>
  execute: (action: "send_template" | "send_message") => Promise<{ ok: boolean; error?: string }>
}

const disabled = async () => ({ ok: false, error: "provider_disabled" })

/** WhatsApp is registered but does not send. A disabled provider never reports success. */
export const whatsappProvider: IntegrationProvider = {
  id: "whatsapp",
  enabled: false,
  testConnection: disabled,
  execute: disabled,
}

export const providers: Record<string, IntegrationProvider> = {
  whatsapp: whatsappProvider,
}
