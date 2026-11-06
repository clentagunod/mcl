package com.mcl.mcllendingapp.domain.model

/** The shared rules require this exact control before financial writes. */
object ReceiptControl {
    fun requireEnabled(fields: Map<String, Any?>?) {
        check(fields != null) {
            "Payment setup is incomplete: settings/receiptControl/current/config is missing. Ask the database administrator to finish payment setup."
        }
        check(fields["mode"] == "ledger-v1" && fields["enabled"] is Boolean) {
            "Payment configuration is invalid. The database administrator must set settings/receiptControl/current/config to mode ledger-v1 with a Boolean enabled field."
        }
        check(fields["enabled"] == true) {
            "Payments are disabled by the database administrator. After verifying loan balances, they can enable settings/receiptControl/current/config."
        }
    }
}
