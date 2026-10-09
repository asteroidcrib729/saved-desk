!define SAVEDDESK_WEBVIEW_GUID "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
; Prerequisites are handled here rather than Tauri's upgrade-skipping WebView section.
; Skip mode in tauri.conf.json disables ONLY that upstream section.
Function SavedDeskReadWebView
  StrCpy $4 ""
  ReadRegStr $4 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\${SAVEDDESK_WEBVIEW_GUID}" "pv"
  ${If} $4 == "0.0.0.0"
    StrCpy $4 ""
  ${EndIf}
  ${If} $4 == ""
    ReadRegStr $4 HKCU "SOFTWARE\Microsoft\EdgeUpdate\Clients\${SAVEDDESK_WEBVIEW_GUID}" "pv"
  ${EndIf}
  ${If} $4 == "0.0.0.0"
    StrCpy $4 ""
  ${EndIf}
FunctionEnd

Function SavedDeskEnsureWebView
  Call SavedDeskReadWebView
  ${If} $4 == ""
    InitPluginsDir
    File "/oname=$PLUGINSDIR\SavedDeskWebView2.exe" "${__FILEDIR__}\..\.cache\webview-runtime\MicrosoftEdgeWebView2RuntimeInstallerX64.exe"
    DetailPrint "Installing the bundled Microsoft WebView2 runtime (no download required)..."
    ClearErrors
    ExecWait '"$PLUGINSDIR\SavedDeskWebView2.exe" /silent /install' $1
    ${If} ${Errors}
      SetErrorLevel 2
      Abort "Microsoft WebView2 could not start. Setup cannot continue."
    ${EndIf}
    ${If} $1 != 0
    ${AndIf} $1 != 3010
    ${AndIf} $1 != -2147219416
      DetailPrint "WebView2 installer exit code: $1"
      SetErrorLevel 2
      Abort "Microsoft WebView2 installation failed. Setup cannot continue."
    ${EndIf}
    ; 0x80040828 means already installed; it is accepted only after detection succeeds.
    ; A successful child exit alone does not prove a usable runtime was registered.
    StrCpy $5 0
    verify_runtime:
      Call SavedDeskReadWebView
      ${If} $4 != ""
        Goto verified_runtime
      ${EndIf}
      IntOp $5 $5 + 1
      ${If} $5 < 30
        Sleep 100
        Goto verify_runtime
      ${EndIf}
      SetErrorLevel 2
      Abort "Microsoft WebView2 is still unavailable. Restart Windows if required, then run setup again."
    verified_runtime:
      Delete "$PLUGINSDIR\SavedDeskWebView2.exe"
  ${EndIf}
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
  Call SavedDeskEnsureWebView
  ; Remove only installer-owned obsolete tools; owner data is outside $INSTDIR.
  RMDir /r "$INSTDIR\worker\_internal\gallery_dl"
  RMDir /r "$INSTDIR\worker\_internal\gallery_dl-1.32.14.dist-info"
  RMDir /r "$INSTDIR\worker\_internal\imageio_ffmpeg"
  RMDir /r "$INSTDIR\worker\_internal\imageio_ffmpeg-0.6.0.dist-info"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ${If} $UpdateMode <> 1
    nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\maintenance\unregister-connector.ps1" -InstallDirectory "$INSTDIR"'
    Pop $0
    ${If} $0 != 0
      DetailPrint "SavedDesk connector cleanup could not complete. User data is preserved."
    ${EndIf}
  ${EndIf}
!macroend
