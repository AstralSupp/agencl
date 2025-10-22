import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_KEY')!;
const ORG_ID = '00000000-0000-0000-0000-000000000001'; // Default org

interface ChatwootWebhook {
  event: string;
  id?: number;
  content?: string;
  message_type?: 'incoming' | 'outgoing';
  content_type?: 'text' | 'audio' | 'image' | 'video' | 'file';
  created_at?: string;
  source_id?: string;
  content_attributes?: {
    audio_url?: string;
    duration?: number;
  };
  sender?: {
    id: number;
    name?: string;
    phone_number?: string;
    identifier?: string;
  };
  conversation?: {
    id: number;
    inbox_id: number;
    status: string;
  };
}

/**
 * Chatwoot webhook handler
 * Receives messages from Chatwoot and stores them in the database
 */
serve(async (req) => {
  try {
    // Only accept POST requests
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Parse webhook payload
    const payload: ChatwootWebhook = await req.json();
    console.log('Received Chatwoot webhook:', payload.event);

    // Only process message_created events
    if (payload.event !== 'message_created') {
      return new Response(JSON.stringify({ status: 'ignored', event: payload.event }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Only process incoming messages (from customers)
    if (payload.message_type !== 'incoming') {
      return new Response(JSON.stringify({ status: 'ignored', reason: 'not_incoming' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Create Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Extract phone number
    const phoneNumber = payload.sender?.phone_number || payload.sender?.identifier || '';
    if (!phoneNumber) {
      throw new Error('No phone number found in webhook');
    }

    // Format phone to E.164
    const phoneE164 = formatPhoneE164(phoneNumber);

    // Get or create customer
    const { data: customerData, error: customerError } = await supabase
      .rpc('get_or_create_customer', {
        p_org_id: ORG_ID,
        p_phone_e164: phoneE164,
        p_name: payload.sender?.name || null,
      });

    if (customerError) {
      throw new Error(`Failed to get/create customer: ${customerError.message}`);
    }

    const customerId = customerData as string;

    // Get or create conversation
    let conversation;
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('*')
      .eq('org_id', ORG_ID)
      .eq('chatwoot_conversation_id', payload.conversation?.id)
      .single();

    if (existingConv) {
      conversation = existingConv;

      // Update last_activity_at
      await supabase
        .from('conversations')
        .update({ last_activity_at: new Date().toISOString() })
        .eq('id', conversation.id);
    } else {
      // Create new conversation
      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert({
          org_id: ORG_ID,
          customer_id: customerId,
          chatwoot_conversation_id: payload.conversation?.id,
          status: 'bot',
          channel: 'whatsapp',
          last_activity_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (convError) {
        throw new Error(`Failed to create conversation: ${convError.message}`);
      }

      conversation = newConv;
    }

    // Determine message type and extract content
    const messageType = payload.content_type || 'text';
    const messageBody = payload.content || '';
    const mediaUrl = payload.content_attributes?.audio_url || null;
    const durationMs = payload.content_attributes?.duration
      ? payload.content_attributes.duration * 1000
      : null;

    // Insert message
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        org_id: ORG_ID,
        conversation_id: conversation.id,
        role: 'user',
        type: messageType,
        body: messageBody,
        media_url: mediaUrl,
        duration_ms: durationMs,
        vendor_msg_id: payload.source_id,
        chatwoot_message_id: payload.id,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (messageError) {
      throw new Error(`Failed to insert message: ${messageError.message}`);
    }

    // Create task to process the message
    const { error: taskError } = await supabase.from('tasks').insert({
      org_id: ORG_ID,
      kind: 'process_message',
      payload: {
        conversation_id: conversation.id,
        message_id: message.id,
      },
      run_at: new Date().toISOString(),
      status: 'pending',
    });

    if (taskError) {
      throw new Error(`Failed to create task: ${taskError.message}`);
    }

    console.log('Message stored and task created:', {
      conversationId: conversation.id,
      messageId: message.id,
    });

    return new Response(
      JSON.stringify({
        status: 'success',
        conversation_id: conversation.id,
        message_id: message.id,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error processing webhook:', error);

    return new Response(
      JSON.stringify({
        status: 'error',
        message: error.message,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});

/**
 * Format phone number to E.164 format
 */
function formatPhoneE164(phone: string, countryCode: string = '55'): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');

  // Remove whatsapp: prefix if present
  const cleanDigits = digits.replace(/^whatsapp:/, '');

  // If already has country code, return with +
  if (cleanDigits.startsWith(countryCode)) {
    return `+${cleanDigits}`;
  }

  // Add country code
  return `+${countryCode}${cleanDigits}`;
}
