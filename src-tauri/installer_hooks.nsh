!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    DeleteRegKey HKCU "Software\Classes\AsterMail.Url.mailto"
    DeleteRegKey HKCU "Software\Clients\Mail\Aster Mail"
    DeleteRegValue HKCU "Software\RegisteredApplications" "Aster Mail"
  ${EndIf}
!macroend
