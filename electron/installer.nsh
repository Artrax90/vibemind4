!macro customUnInstall
  ; Kill VibeMind processes first
  nsExec::ExecToLog 'taskkill /F /IM "VibeMind Desktop App.exe" /T'
  nsExec::ExecToLog 'taskkill /F /IM "electron.exe" /T'
  Sleep 1000

  MessageBox MB_YESNO "Delete all local data (notes, settings, cache)?" IDYES cleanup
  Goto done
cleanup:
  RMDir /r "$APPDATA\VibeMind"
  RMDir /r "$APPDATA\VibeMind Desktop"
  RMDir /r "$LOCALAPPDATA\vibemind-desktop-updater"
  RMDir /r "$LOCALAPPDATA\vibemind-updater"
done:
!macroend
