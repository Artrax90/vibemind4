!macro customUnInstall
  MessageBox MB_YESNO "Delete all local data (notes, settings, cache)?" IDYES cleanup
  Goto done
cleanup:
  RMDir /r "$APPDATA\VibeMind"
  RMDir /r "$APPDATA\VibeMind Desktop"
  RMDir /r "$LOCALAPPDATA\vibemind-desktop-updater"
  RMDir /r "$LOCALAPPDATA\vibemind-updater"
done:
!macroend
