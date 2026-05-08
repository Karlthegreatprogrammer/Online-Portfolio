/* Demo portfolio copy configuration.
   The publishable/anon key is safe for browser use, but keep service role keys
   and database passwords private. Do not connect this copy to production data. */
(function () {
    "use strict";

    window.LBU_SUPABASE_CONFIG = Object.freeze({
        enabled: true,
        url: "https://blcqllroxujfqqxmombi.supabase.co",
        anonKey: "sb_publishable_DXnFqPmRU5BB086B165awA_CXoGsjnB",
        schema: "public",
        recordsTable: "lb_records",
        ceuRecordsTable: "ceu_records",
        auditTable: "record_audit_logs",
        attachmentsTable: "record_attachments",
        attachmentsBucket: "record-attachments",
        attachmentSignedUrlTtl: 3600,
        attachmentTempTtlHours: 24,
        adminEmails: [
            "test@gmail.com"
        ],
        adminEmail: "test@gmail.com",
        demoLogin: {
            enabled: true,
            email: "test@gmail.com",
            password: "LBU-Demo-681089e2fcdd!"
        },
        sdkUrl: "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"
    });
})();
