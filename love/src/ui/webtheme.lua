-- webtheme.lua — Web 版视觉规格（配色 / 布局坐标 / 字体）
-- 数值提取自 web/style.css 的 :root 与 1600×900 视口下 #room 各元素实测坐标。

local WEB = {}

-- ==================== 配色（:root 变量） ====================

WEB.panelFace   = { 0.902, 0.878, 0.816 }   -- #e6e0d0
WEB.panelFace2  = { 0.863, 0.839, 0.773 }   -- #dcd6c5
WEB.panelEdge   = { 0.722, 0.698, 0.627 }   -- #b8b2a0
WEB.panelFrame  = { 0.561, 0.541, 0.471 }   -- #8f8a78
WEB.screw       = { 0.431, 0.416, 0.361 }   -- #6e6a5c
WEB.dialFace    = { 0.957, 0.949, 0.918 }   -- #f4f2ea
WEB.dialFaceHi  = { 0.980, 0.973, 0.949 }   -- #faf8f2（径向渐变内圈）
WEB.dialFaceLo  = { 0.910, 0.894, 0.847 }   -- #e8e4d8（外圈）
WEB.dialBezel   = { 0.180, 0.173, 0.157 }   -- #2e2c28
WEB.dialMark    = { 0.110, 0.102, 0.086 }   -- #1c1a16
WEB.dialNeedle  = { 0.761, 0.141, 0.063 }   -- #c22410
WEB.lampOff     = { 0.839, 0.820, 0.761 }   -- #d6d1c2
WEB.lampOffEdge = { 0.659, 0.635, 0.565 }   -- #a8a290
WEB.lampRed     = { 0.878, 0.204, 0.094 }   -- #e03418
WEB.lampGreen   = { 0.180, 0.620, 0.267 }   -- #2e9e44
WEB.lampAmber   = { 0.910, 0.643, 0.094 }   -- #e8a418
WEB.ink         = { 0.110, 0.102, 0.086 }   -- #1c1a16
WEB.inkSoft     = { 0.361, 0.341, 0.290 }   -- #5c574a
WEB.inkFaint    = { 0.541, 0.518, 0.455 }   -- #8a8474
WEB.engraved    = { 0.290, 0.275, 0.227 }   -- #4a463a
WEB.btnRed      = { 0.753, 0.173, 0.078 }   -- #c02c14
WEB.btnRedHi    = { 0.878, 0.329, 0.220 }   -- #e05438
WEB.btnBlack    = { 0.149, 0.141, 0.122 }   -- #26241f
WEB.btnCream    = { 0.847, 0.824, 0.753 }   -- #d8d2c0
WEB.wallHi      = { 0.761, 0.737, 0.667 }   -- #c2bcaa（墙面渐变顶）
WEB.wallMid     = { 0.702, 0.678, 0.608 }   -- #b3ad9b
WEB.wallLo      = { 0.659, 0.635, 0.565 }   -- #a8a290
WEB.deskTop     = { 0.561, 0.541, 0.463 }   -- #8f8a76
WEB.desk        = { 0.490, 0.471, 0.404 }   -- #7d7867
WEB.floor       = { 0.420, 0.400, 0.353 }   -- #6b665a
WEB.fluor       = { 0.984, 0.973, 0.937 }   -- #fbf8ef
WEB.readoutBg   = { 0.957, 0.949, 0.918 }   -- gauge-readout 底 #f4f2ea
WEB.consoleText = { 0.910, 0.886, 0.816 }   -- #e8e2d0
WEB.consoleDim  = { 0.722, 0.698, 0.627 }   -- #b8b2a0
WEB.ledAmber    = { 1.0, 0.847, 0.471 }     -- #ffd878（琥珀 LED 字）
WEB.logPaper    = { 0.949, 0.925, 0.847 }   -- #f2ecd8
WEB.logInk      = { 0.227, 0.216, 0.180 }   -- #3a372e
WEB.logWarn     = { 0.604, 0.416, 0.031 }   -- #9a6a08
WEB.logAlarm    = { 0.690, 0.125, 0.063 }   -- #b02010
WEB.chartPaper  = { 0.949, 0.925, 0.847 }   -- #f2ecd8
WEB.coreBg      = { 0.118, 0.110, 0.094 }   -- #1e1c18
WEB.coreFrame   = { 0.227, 0.220, 0.188 }   -- #3a3830
WEB.rodGray     = { 0.541, 0.533, 0.471 }   -- #8a8878
WEB.rodDark     = { 0.110, 0.102, 0.086 }   -- #1c1a16
WEB.amber       = { 0.831, 0.643, 0.157 }   -- #d4a828 / #e8a418 系

-- ==================== 布局坐标（1600×900 实测，x,y,w,h） ====================

WEB.L = {
  roomPadX       = 19,
  plantSign      = { 595, 14, 410, 55 },
  wallClock      = { 1448, 12, 120, 120 },
  datePlate      = { 1460, 136, 96, 17 },
  storyHud       = { 516, 0, 567, 36 },
  -- 上排面板
  panelWall      = { 19, 79, 1562, 268 },
  panelPower     = { 19, 79, 419, 268 },
  panelCore      = { 449, 79, 312, 268 },
  panelRods      = { 770, 79, 276, 268 },
  panelReactivity= { 1056, 79, 276, 268 },
  panelAz        = { 1341, 79, 240, 268 },
  dialPower      = { 75, 135, 150, 150 },
  dialPeriod     = { 233, 135, 150, 150 },
  lampBank       = { 31, 332, 395, 68 },     -- 底部 21px 被面板边界裁切（与 web 一致）
  coreCanvas     = { 461, 135, 288, 354 },   -- 底部溢出被裁（与 web 一致）
  rodsCanvas     = { 782, 135, 252, 317 },
  rhoCanvas      = { 1068, 135, 252, 153 },
  chartCanvas    = { 1068, 340, 252, 162 },  -- 面板底 347，仅露 7px + 下段独立绘制
  azCover        = { 1408, 139, 106, 106 },
  keySwitch      = { 1433, 314, 56, 56 },
  -- 下排面板
  panelWallBottom= { 19, 351, 1562, 324 },
  panelQuadrants = { 29, 361, 331, 304 },
  panelSep       = { 370, 361, 331, 304 },
  panelRodDrive  = { 711, 361, 254, 304 },
  panelRecorder  = { 976, 361, 331, 304 },
  panelRadiation = { 1317, 361, 254, 304 },
  canvasQuadrants= { 95, 421, 200, 200 },
  canvasSepLevel = { 495, 421, 82, 162 },
  canvasRodDrive = { 737, 421, 202, 82 },
  canvasRecorder = { 1040, 421, 202, 162 },
  lampBankNew    = { 1329, 481, 230, 120 },
  btnKvit        = { 1420, 607, 48, 48 },
  -- 控制台
  consoleDesk    = { 19, 685, 1562, 127 },
  consoleUnits   = {
    { 183, 697, 211, 106 },   -- 目标功率
    { 401, 697, 220, 106 },   -- 提棒速率
    { 631, 697, 141, 106 },   -- 运行模式
    { 784, 697, 262, 106 },   -- ГЦН
    { 1054, 697, 170, 106 },  -- 量程
    { 1231, 697, 186, 106 },  -- 时间
  },
  machineLog     = { 19, 666, 240, 150 },
  deskProps      = { 19, 812, 1562, 88 },
  propsX0        = 494,                      -- 首个 prop 卡片 x
  propSize       = { 76, 70 },
  versionStamp   = { 1506, 792, 70, 41 },
}

-- ==================== 字体 ====================

-- web: PT Sans（正文）/ PT Mono（数字）/ Oswald（展示标题）/ Noto Sans SC（中文回退）
-- LÖVE 单字体无回退链：西里尔/数字用 PT 系，中文用 simhei。
local fonts = {}          -- [name..size] -> Font
local loaded = false
local displayData, monoData, sansData = nil, nil, nil

local CANDIDATES = {
  display = { 'assets/fonts/Oswald-Medium.ttf', 'assets/fonts/pt/Oswald-Medium.ttf' },
  mono    = { 'assets/fonts/PT_Mono-Web-Regular.ttf', 'assets/fonts/pt/PT_Mono-Web-Regular.ttf' },
  sans    = { 'assets/fonts/PT_Sans-Web-Regular.ttf', 'assets/fonts/pt/PT_Sans-Web-Regular.ttf' },
  cn      = { 'assets/fonts/simhei_fb.ttf', 'assets/fonts/simhei.ttf' },
}

local function probe(paths)
  for _, p in ipairs(paths) do
    if love.filesystem.getInfo(p) then return p end
  end
  return nil
end

function WEB.loadFonts()
  if loaded then return end
  loaded = true
  displayData = probe(CANDIDATES.display)
  monoData = probe(CANDIDATES.mono)
  sansData = probe(CANDIDATES.sans)
  fonts.cnData = probe(CANDIDATES.cn)
  -- 中文兜底：simhei 缺失时用任意西文字体
  fonts.cnData = fonts.cnData or monoData or sansData or displayData
end

function WEB._debug()
  WEB.loadFonts()
  local ok, f = pcall(love.graphics.newFont, 'assets/fonts/simhei.ttf', 14)
  local wok, w = false, 0
  if ok and f then wok, w = pcall(function() return f:getWidth('功率测试') end) end
  return string.format('cn=%s disp=%s mono=%s sans=%s | newFont ok=%s w-ok=%s w=%s',
    tostring(fonts.cnData), tostring(displayData), tostring(monoData), tostring(sansData),
    tostring(ok), tostring(wok), tostring(w))
end

-- kind: 'display' | 'mono' | 'sans' | 'cn'
function WEB.getFont(kind, size)
  WEB.loadFonts()
  size = math.floor(size + 0.5)
  if size < 6 then size = 6 end
  local key = kind .. size
  if fonts[key] then return fonts[key] end
  local data
  if kind == 'cn' then data = fonts.cnData
  elseif kind == 'display' then data = displayData or fonts.cnData or sansData
  elseif kind == 'mono' then data = monoData or fonts.cnData or sansData
  elseif kind == 'sans' then data = sansData or fonts.cnData or displayData end
  local font
  if data then
    local ok, f = pcall(love.graphics.newFont, data, size)
    if ok then font = f end
  end
  if not font then font = love.graphics.newFont(size) end
  fonts[key] = font
  return font
end

-- 混排选择：字符串含 CJK/全角 → cn 字体；否则按 kind
function WEB.fontFor(kind, text, size)
  if kind == 'cn' then return WEB.getFont('cn', size) end
  for _, cp in ipairs({ string.byte(text, 1, math.min(#text, 64)) }) do
    if cp >= 0xE0 then return WEB.getFont('cn', size) end   -- UTF-8 三字节起 → CJK/西里尔宽字
  end
  return WEB.getFont(kind, size)
end

return WEB
