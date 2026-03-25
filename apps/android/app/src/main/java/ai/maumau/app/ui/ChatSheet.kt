package ai.maumau.app.ui

import androidx.compose.runtime.Composable
import ai.maumau.app.MainViewModel
import ai.maumau.app.ui.chat.ChatSheetContent

@Composable
fun ChatSheet(viewModel: MainViewModel) {
  ChatSheetContent(viewModel = viewModel)
}
