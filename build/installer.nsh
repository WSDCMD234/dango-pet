; 万能团子安装包的自定义部分。放在 build/ 下，electron-builder 打包时会自动带进安装脚本。
;
; 做三件事：
;  1. 不问「给谁装」：固定只装给当前用户，不需要管理员权限 —— 所以打开安装包，第一页就是「装到哪儿」。
;  2. 第一次安装时不默认占 C 盘：电脑里有别的内置硬盘分区（D、E……）就默认装到那里；
;     没有（只有一个 C 盘，或者别的盘是 U 盘 / 移动硬盘 / 网络盘）才装到用户文件夹。
;     以前装过的：默认还是原来的位置。命令行用 /D=路径 指定了位置的：照指定的来。
;  3. 选的位置写不进去（当前用户没权限，比如 C:\Program Files）：「安装」按钮变灰，并在页面上说明原因，
;     不让它装到一半才报错。

;
; 安装包只有简体中文（package.json 里 nsis.installerLanguages），所以这里的文字都直接写中文。

!ifndef BUILD_UNINSTALLER

  ; 允许直接选「E:\」这样的盘根目录（安装时会自动在里面补一层 ${APP_FILENAME} 文件夹，不会把文件撒在根目录）
  AllowRootDirInstall true

  ; 「装到哪儿」那一页最上面的说明
  !define DANGO_DIR_TEXT "选一个文件夹来安装 $(^NameDA)。想换位置：点「浏览」，或者直接改下面的路径（比如把 D 改成 E）。"
  !define MUI_DIRECTORYPAGE_TEXT_TOP "${DANGO_DIR_TEXT}"

  ; 找一个适合默认安装的盘，盘符（一个字母）放进 $R9，找不到就是空。
  ; 条件：不是系统盘、本地固定磁盘、剩余空间 ≥ 5 GB、是内置硬盘、当前用户能往里写。
  !macro dangoPickDrive
    StrCpy $R9 ""
    StrCpy $R1 "DEFGHIJKLMNOPQRSTUVWXYZ"
    StrCpy $R2 0
    StrCpy $R3 $WINDIR 1                ; 系统盘的盘符
    ${Do}
      StrCpy $R4 $R1 1 $R2
      ${If} $R4 == ""
        ${Break}
      ${EndIf}
      IntOp $R2 $R2 + 1
      StrCpy $R5 "ok"
      StrCpy $R6 -1                     ; 总线类型
      StrCpy $R7 1                      ; 是不是可移动介质
      StrCpy $9 0                       ; 剩余空间（MB）
      StrCpy $4 "$R4:\"
      ${If} $R4 == $R3
        StrCpy $R5 "system-drive"
      ${EndIf}

      ; 本地固定磁盘（3 = DRIVE_FIXED；光驱、网络盘、U 盘都不是 3）
      ${If} $R5 == "ok"
        System::Call 'kernel32::GetDriveType(t r4)i.r0'
        ${If} $0 != 3
          StrCpy $R5 "not-fixed"
        ${EndIf}
      ${EndIf}

      ; 剩余空间：小于 5 GB 的不选（快满的盘、厂商的恢复分区）
      ${If} $R5 == "ok"
        System::Call 'kernel32::GetDiskFreeSpaceEx(t r4, *l .r1, *l .r2, *l .r3)i.r0'
        ${If} $0 == 0
          StrCpy $R5 "no-space-info"
        ${Else}
          System::Int64Op $1 / 1048576
          Pop $9
          ${If} $9 < 5120
            StrCpy $R5 "low-space"
          ${EndIf}
        ${EndIf}
      ${EndIf}

      ; 内置硬盘：问一下这个盘接在什么总线上。移动硬盘在系统里也算「固定磁盘」，拔掉以后团子就打不开了，所以不选。
      ${If} $R5 == "ok"
        StrCpy $4 "\\.\$R4:"
        System::Call 'kernel32::CreateFile(t r4, i 0, i 3, p 0, i 3, i 0, p 0)p.r5'
        ${If} $5 != -1
          System::Call '*(i 0, i 0, i 0)p.r6'
          System::Alloc 1024
          Pop $7
          ; IOCTL_STORAGE_QUERY_PROPERTY → STORAGE_DEVICE_DESCRIPTOR（第 10 字节 RemovableMedia，第 28 字节 BusType）
          System::Call 'kernel32::DeviceIoControl(p r5, i 0x2D1400, p r6, i 12, p r7, i 1024, *i .r8, p 0)i.r0'
          ${If} $0 != 0
            System::Call '*$7(i, i, &i1, &i1, &i1 .R7, &i1, i, i, i, i, i .R6)'
          ${EndIf}
          System::Free $6
          System::Free $7
          System::Call 'kernel32::CloseHandle(p r5)'
        ${EndIf}
        ; 只认内置的几种：1 SCSI、3 ATA、8 RAID、10 SAS、11 SATA、16 存储空间、17 NVMe（7 是 USB，12 / 13 是存储卡，14 / 15 是虚拟盘）
        ${If} $R7 != 0
          StrCpy $R5 "removable"
        ${ElseIf} $R6 != 1
        ${AndIf} $R6 != 3
        ${AndIf} $R6 != 8
        ${AndIf} $R6 != 10
        ${AndIf} $R6 != 11
        ${AndIf} $R6 != 16
        ${AndIf} $R6 != 17
          StrCpy $R5 "not-internal"
        ${EndIf}
      ${EndIf}

      ; 当前用户能往里写（试着建文件夹、写一个文件，马上删掉）
      ${If} $R5 == "ok"
        ClearErrors
        CreateDirectory "$R4:\${APP_FILENAME}"
        FileOpen $0 "$R4:\${APP_FILENAME}\.write-test" w
        ${If} ${Errors}
          StrCpy $R5 "not-writable"
        ${Else}
          FileClose $0
          Delete "$R4:\${APP_FILENAME}\.write-test"
        ${EndIf}
        RMDir "$R4:\${APP_FILENAME}"        ; 只删空文件夹，里面有东西就留着
        ClearErrors
      ${EndIf}

      !ifdef DANGO_PROBE
        FileWrite $R8 "$R4: $R5 | free MB $9 | bus $R6 | removable $R7$\r$\n"
      !endif

      ${If} $R5 == "ok"
        StrCpy $R9 $R4
        ${Break}
      ${EndIf}
    ${Loop}
  !macroend

  ; 「装到哪儿」那一页：位置每变一次，安装程序都会来问一下「这个位置行不行」。
  ; 当前用户没权限往里放东西的，就让「安装」按钮变灰，并把页面最上面那段说明换成原因。
  !macro customHeader
    Var dangoDefaultDir
    Var dangoDirBad
    Var dangoDirNote

    Function .onVerifyInstDir
      Push $R0
      Push $R1
      Push $R2
      Push $R3
      Push $R4
      Push $R5

      ; 真正会装进去的文件夹：和安装时的规则一样，路径里不带 ${APP_FILENAME} 的会在后面补一层
      StrCpy $R0 $INSTDIR
      StrCpy $R5 ""
      ${StrContains} $R1 "${APP_FILENAME}" $INSTDIR
      ${If} $R1 == ""
        StrCpy $R5 "sub"
        StrCpy $R1 $INSTDIR 1 -1
        ${If} $R1 == "\"
          StrCpy $R0 "$INSTDIR${APP_FILENAME}"
        ${Else}
          StrCpy $R0 "$INSTDIR\${APP_FILENAME}"
        ${EndIf}
      ${EndIf}

      ; 往上找到第一个已经存在的文件夹，看当前用户有没有权限往里放东西（只查权限，不真的写）
      StrCpy $R2 6                        ; 文件夹已经在了：要能在里面建文件（2）和子文件夹（4）
      ${DoUntil} ${FileExists} "$R0\*.*"
        ${GetParent} $R0 $R0
        StrCpy $R2 4                      ; 文件夹还没有：上一层能建子文件夹就行
        ${If} $R0 == ""
          ${Break}
        ${EndIf}
      ${Loop}
      StrCpy $R4 "bad"
      ${If} $R0 != ""
        StrLen $R1 $R0
        ${If} $R1 == 2
          StrCpy $R0 "$R0\"               ; 「D:」要写成「D:\」
        ${EndIf}
        System::Call 'kernel32::CreateFile(t R0, i R2, i 7, p 0, i 3, i 0x02000000, p 0)p.R3'
        ${If} $R3 != -1
          System::Call 'kernel32::CloseHandle(p R3)'
          StrCpy $R4 "ok"
        ${EndIf}
      ${EndIf}

      ; 页面最上面那段说明文字：平时是说明；路径里没带 ${APP_FILENAME} 的，告诉一声会补一层；写不进去的，说原因
      ${If} $R4 == "ok"
        StrCpy $dangoDirBad "0"
        ${If} $R5 == "sub"
          StrCpy $R1 "${DANGO_DIR_TEXT}$\r$\n$\r$\n会在这个文件夹里新建一个「${APP_FILENAME}」文件夹，团子装在那里面。"
        ${Else}
          StrCpy $R1 "${DANGO_DIR_TEXT}"
        ${EndIf}
      ${Else}
        StrCpy $dangoDirBad "1"
        StrCpy $R1 "这个位置写不进去（一般是因为它需要管理员权限）。$\r$\n请换一个文件夹，比如：$dangoDefaultDir"
      ${EndIf}
      ${If} $R1 != $dangoDirNote
        StrCpy $dangoDirNote $R1
        FindWindow $R2 "#32770" "" $HWNDPARENT
        GetDlgItem $R2 $R2 1006
        SendMessage $R2 ${WM_SETTEXT} 0 "STR:$R1"
      ${EndIf}

      ; 这一页其实是第一页（前面「给谁装」那页被跳过了）：「上一步」没有地方可退，点了安装程序会直接退出，所以置灰
      GetDlgItem $R1 $HWNDPARENT 3
      EnableWindow $R1 0

      Pop $R5
      Pop $R4
      Pop $R3
      Pop $R2
      Pop $R1
      Pop $R0
      ${If} $dangoDirBad == "1"
        Abort
      ${EndIf}
    FunctionEnd
  !macroend

  ; 安装包启动时：决定「装到哪儿」那一页里默认填什么
  !macro customInit
    ${If} $installMode == "CurrentUser"
    ${AndIf} $perUserInstallationFolder == ""
      !insertmacro GetDParameter $R0
      ${If} $R0 == ""
        !insertmacro dangoPickDrive
        ${If} $R9 != ""
          StrCpy $INSTDIR "$R9:\${APP_FILENAME}"
        ${EndIf}
      ${EndIf}
    ${EndIf}
    StrCpy $dangoDefaultDir $INSTDIR
    StrCpy $dangoDirBad "0"
    StrCpy $dangoDirNote ""
  !macroend

  ; 「给谁装」那一页：已经定了只给当前用户装，直接跳过
  !macro customInstallMode
    ${If} $installMode == "CurrentUser"
      Abort
    ${EndIf}
  !macroend

!endif
