package com.mcl.mcllendingapp.util.documents

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.activity.result.contract.ActivityResultContract
import com.mcl.mcllendingapp.domain.model.DocumentArtifact

class DocumentDestinationContract : ActivityResultContract<DocumentArtifact, Uri?>() {
    override fun createIntent(context: Context, input: DocumentArtifact): Intent = Intent(Intent.ACTION_CREATE_DOCUMENT)
        .addCategory(Intent.CATEGORY_OPENABLE).setType(input.mimeType).putExtra(Intent.EXTRA_TITLE, input.filename)

    override fun parseResult(resultCode: Int, intent: Intent?): Uri? =
        if (resultCode == Activity.RESULT_OK) intent?.data else null
}
