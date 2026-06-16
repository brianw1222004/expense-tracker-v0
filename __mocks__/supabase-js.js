// Minimal @supabase/supabase-js mock for Jest unit tests.
// supabase.js imports createClient from this package. Our tests never
// exercise actual Supabase network calls, so a no-op stub is sufficient.
const createClient = jest.fn(() => null);

module.exports = { createClient };
