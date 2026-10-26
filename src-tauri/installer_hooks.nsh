!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    DeleteRegKey HKCU "Software\Classes\AsterMail.Url.mailto"
    DeleteRegKey HKCU "Software\Clients\Mail\Aster Mail"
    DeleteRegValue HKCU "Software\RegisteredApplications" "Aster Mail"
  ${EndIf}
!macroend

!macro ASTER_REFRESH_SHELL_ITEM path
  IfFileExists "${path}" 0 +2
    System::Call 'shell32::SHChangeNotify(i 0x00002000, i 0x0005, w "${path}", p 0)'
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro ASTER_REFRESH_SHELL_ITEM "$INSTDIR\${MAINBINARYNAME}.exe"
  !insertmacro ASTER_REFRESH_SHELL_ITEM "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
  !insertmacro ASTER_REFRESH_SHELL_ITEM "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  !insertmacro ASTER_REFRESH_SHELL_ITEM "$DESKTOP\${PRODUCTNAME}.lnk"
  IfFileExists "$SYSDIR\ie4uinit.exe" 0 +2
    nsExec::Exec '"$SYSDIR\ie4uinit.exe" -show'
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0x1000, p 0, p 0)'
!macroend
