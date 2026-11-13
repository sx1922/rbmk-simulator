const Props = (() => {

  const gt = id => document.getElementById(id);
  const overlay = gt('prop-overlay');
  const stage = gt('prop-stage');
  let openProp = null;

  const MANUAL = [
    { ru: 'ОБЛОЖКА', cn: '封面', en: 'COVER', tab: '封面',
      body: () => {
        var l = manualLang;
        if (l === 'en') return '<div style="text-align:center;padding-top:40px;"><div style="font-size:10px;letter-spacing:2px;color:#6e6a5c;">MINISTRY OF MEDIUM MACHINE BUILDING OF THE USSR</div><div style="margin:24px auto;width:60%;border-top:2px solid #8a1f14;border-bottom:2px solid #8a1f14;padding:18px 0;"><div class="m-title-en" style="font-size:30px;">RBMK-1000</div><div style="font-size:15px;letter-spacing:4px;color:#4a463a;margin:6px 0;">REACTOR INSTALLATION</div><div style="font-size:13px;color:#6e6a5c;letter-spacing:6px;">OPERATING REGULATIONS</div></div><div style="font-family:monospace;font-size:10px;color:#6e6a5c;line-height:2;">Doc. No. RBMK-1000.00.00.000 RE<br>1986 Edition<br>For Official Use Only (DSP)</div><div style="margin-top:20px;"><span class="m-stamp">APPROVED<br>12.10.1983</span><span class="m-stamp" style="transform:rotate(6deg);margin-left:16px;">AMEND. No.12<br>15.03.1984</span></div><div style="margin-top:26px;font-size:11px;letter-spacing:3px;color:#4a463a;">CHERNOBYL NPP · UNIT 4</div></div>';
        if (l === 'ru') return '<div style="text-align:center;padding-top:40px;"><div style="font-size:10px;letter-spacing:2px;color:#6e6a5c;">МИНИСТЕРСТВО СРЕДНЕГО МАШИНОСТРОЕНИЯ СССР</div><div style="margin:24px auto;width:60%;border-top:2px solid #8a1f14;border-bottom:2px solid #8a1f14;padding:18px 0;"><div class="m-title-ru" style="font-size:30px;">РБМК-1000</div><div style="font-size:15px;letter-spacing:4px;color:#4a463a;margin:6px 0;">РЕАКТОРНАЯ УСТАНОВКА</div><div style="font-size:13px;color:#6e6a5c;letter-spacing:6px;">ЭКСПЛУАТАЦИОННЫЙ РЕГЛАМЕНТ</div></div><div style="font-family:monospace;font-size:10px;color:#6e6a5c;line-height:2;">Документ № РБМК-1000.00.00.000 РЭ<br>Издание 1986 г.<br>Для служебного пользования</div><div style="margin-top:20px;"><span class="m-stamp">УТВЕРЖДЕНО<br>12.10.1983</span><span class="m-stamp" style="transform:rotate(6deg);margin-left:16px;">ИЗМ. №12<br>15.03.1984</span></div><div style="margin-top:26px;font-size:11px;letter-spacing:3px;color:#4a463a;">ЧЕРНОБЫЛЬСКАЯ АЭС · БЛОК №4</div></div>';
        return '<div style="text-align:center;padding-top:40px;"><div style="font-size:10px;letter-spacing:2px;color:#6e6a5c;">苏联中型机械工业部</div><div style="margin:24px auto;width:60%;border-top:2px solid #8a1f14;border-bottom:2px solid #8a1f14;padding:18px 0;"><div class="m-title-cn" style="font-size:30px;">РБМК-1000</div><div style="font-size:15px;letter-spacing:4px;color:#4a463a;margin:6px 0;">反应堆装置 · 运行规程</div><div style="font-size:13px;color:#6e6a5c;letter-spacing:6px;">ЭКСПЛУАТАЦИОННЫЙ РЕГЛАМЕНТ</div></div><div style="font-family:monospace;font-size:10px;color:#6e6a5c;line-height:2;">文件编号 РБМК-1000.00.00.000 РЭ<br>1986 年修订版 · 密级 ДСП</div><div style="margin-top:20px;"><span class="m-stamp">批准<br>12.10.1983</span><span class="m-stamp" style="transform:rotate(6deg);margin-left:16px;">修改 №12<br>15.03.1984</span></div><div style="margin-top:26px;font-size:11px;letter-spacing:3px;color:#4a463a;">切尔诺贝利核电站 · 4号机组</div></div>';
      }
    },
    // 1: TOC
    { ru: 'ОГЛАВЛЕНИЕ', cn: '目录', en: 'CONTENTS', tab: '目录',
      body: () => {
        var l = manualLang, sub = l === 'en' ? 3 : 2;
        var toc = [[1,'反应堆装置简述','КРАТКОЕ ОПИСАНИЕ РУ','Reactor Installation Overview'],[2,'反应性与控制棒','РЕАКТИВНОСТЬ И СТЕРЖНИ','Reactivity and Control Rods'],[3,'功率、周期与氙中毒','МОЩНОСТЬ, ПЕРИОД, КСЕНОН','Power, Period, Xenon'],[4,'汽水分离器与给水系统','СЕПАРАТОРЫ И ПИТАТЕЛЬНАЯ ВОДА','Steam Separators and Feedwater'],[5,'热工水力与燃料包壳','ТЕПЛОГИДРАВЛИКА И ОБОЛОЧКИ','Thermal Hydraulics and Cladding'],[6,'衰变热与停堆后冷却','ОСТАТОЧНОЕ ТЕПЛОВЫДЕЛЕНИЕ','Decay Heat and Post-Shutdown Cooling'],[7,'紧急保护系统','АВАРИЙНАЯ ЗАЩИТА','Emergency Protection'],[8,'运行限制与 ОЗР','ПРЕДЕЛЫ И ОЗР','Operating Limits and ORM'],[9,'仪表与监测系统','ПРИБОРЫ И СИСТЕМА КОНТРОЛЯ','Instrumentation and Monitoring'],[10,'辐射监测','РАДИАЦИОННЫЙ КОНТРОЛЬ','Radiation Monitoring'],[11,'正常操作程序','НОРМАЛЬНЫЕ ОПЕРАЦИИ','Normal Operating Procedures'],[12,'异常工况与事故处理','АВАРИЙНЫЕ РЕЖИМЫ','Abnormal Conditions'],[0,'附录 A 保护定值表','ПРИЛОЖЕНИЕ А','Appendix A · Setpoints'],[0,'附录 B 缩略语','ПРИЛОЖЕНИЕ Б','Appendix B · Abbreviations'],[0,'附录 C 修改通知','ПРИЛОЖЕНИЕ В','Appendix C · Amendments']];
        var h = '<div class="m-head"><span>РБМК-1000.00.00.000 РЭ</span><span>ОГЛАВЛЕНИЕ</span></div><div class="m-title-ru">ОГЛАВЛЕНИЕ</div><div class="m-title-cn">目录</div><div class="m-title-en">TABLE OF CONTENTS</div><table class="m-table">';
        toc.forEach(function(t,i) { h += '<tr style="cursor:pointer;" onclick="Props.gotoPage(' + (i + 2) + ')"><td style="width:40px;font-family:monospace;">' + (i < 12 ? (i + 1) : String.fromCharCode(65 + i - 12)) + '</td><td><b>' + t[1] + '</b><br><span style="font-size:10px;color:#8a8474;">' + t[sub] + '</span></td><td style="width:60px;text-align:right;font-family:monospace;">' + (i + 3) + '</td></tr>'; });
        return h + '</table>';
      }
    },
    // 2-13: 第1-12章
    { ru: 'ГЛ.1 ОПИСАНИЕ', cn: '第1章 装置简述', en: 'Ch.1 Overview', tab: '1 简述',
      body: () => {
        var l = manualLang;
        if (l === 'en') return '<div class="m-head"><span>CHAPTER 1</span><span>p.3</span></div><div class="m-title-ru">КРАТКОЕ ОПИСАНИЕ РУ</div><div class="m-title-cn">第1章 装置简述</div><div class="m-title-en">CHAPTER 1 · REACTOR INSTALLATION OVERVIEW</div><div class="m-h2">1.1 General Characteristics</div><p class="m-p">The RBMK-1000 is a graphite-moderated, light-water-cooled boiling reactor: graphite stack as moderator, core Ø11.8 × 7 m, 1661 fuel channels, coolant boils inside channels, steam sent directly to turbine. 4 horizontal steam separators, 8 MCP (6 operating, 2 standby).</p><div class="m-h2">1.2 Principal Parameters</div><table class="m-table"><tr><th>Parameter</th><th>Value</th></tr><tr><td>Rated thermal power</td><td><span class="m-link" onclick="Props.highlight(\'dial-power\')">3200 MW</span></td></tr><tr><td>Electrical power</td><td>1000 MW</td></tr><tr><td>Fuel channels / rods</td><td>1661 / 211</td></tr><tr><td>Separator pressure</td><td>6.9 MPa</td></tr><tr><td>Feedwater flow</td><td>~5000 m³/h</td></tr><tr><td>Steam flow</td><td>~7680 t/h</td></tr></table>';
        if (l === 'ru') return '<div class="m-head"><span>ГЛАВА 1</span><span>стр.3</span></div><div class="m-title-ru">КРАТКОЕ ОПИСАНИЕ РУ</div><div class="m-title-cn">第1章 装置简述</div><div class="m-title-en">CHAPTER 1 · OVERVIEW</div><p class="m-p">РБМК-1000 — графитомодерируемый, водоохлаждаемый кипящий реактор. 1661 ТК, 4 ДС, 8 ГЦН.</p><table class="m-table"><tr><th>Параметр</th><th>Значение</th></tr><tr><td>N тепл.</td><td><span class="m-link" onclick="Props.highlight(\'dial-power\')">3200 МВт</span></td></tr><tr><td>ТК / стержни</td><td>1661 / 211</td></tr></table>';
        return '<div class="m-head"><span>ГЛАВА 1</span><span>стр.3</span></div><div class="m-title-ru">КРАТКОЕ ОПИСАНИЕ РУ</div><div class="m-title-cn">第1章 装置简述</div><div class="m-title-en">CHAPTER 1 · OVERVIEW</div><div class="m-h2">1.1 总体特征</div><p class="m-p">РБМК-1000（大功率压力管式反应堆）是石墨慢化、轻水冷却的沸水堆。石墨砌体作为慢化剂，堆芯 Ø11.8 × 7 м，1661 根工艺管，4 台卧式汽水分离器，8 台主循环泵。</p><div class="m-h2">1.2 主要参数</div><table class="m-table"><tr><th>参数</th><th>数值</th></tr><tr><td>额定热功率</td><td><span class="m-link" onclick="Props.highlight(\'dial-power\')">3200 МВт</span></td></tr><tr><td>电功率</td><td>1000 МВт</td></tr><tr><td>工艺管/控制棒</td><td>1661 / 211 根</td></tr><tr><td>分离器压力</td><td>6.9 МПа</td></tr><tr><td>给水流量</td><td>~5000 м³/ч</td></tr><tr><td>蒸汽流量</td><td>~7680 т/ч</td></tr></table>';
      }
    },
    { ru: 'ГЛ.2 РЕАКТИВНОСТЬ', cn: '第2章 反应性与控制棒', en: 'Ch.2 Reactivity', tab: '2 反应性',
      body: () => {
        var l = manualLang;
        if (l === 'en') return '<div class="m-head"><span>CHAPTER 2</span><span>p.5</span></div><div class="m-title-ru">РЕАКТИВНОСТЬ И СТЕРЖНИ</div><div class="m-title-cn">第2章 反应性与控制棒</div><div class="m-title-en">CHAPTER 2 · REACTIVITY AND CONTROL RODS</div><div class="m-h2">2.1 Rod Construction</div><p class="m-p">B₄C absorber / graphite displacer (~4.5 m) / water column (~1.25 m). Drive speed 0.4 m/s.</p><div class="m-h2">2.2 End Effect</div><p class="m-p">Rod withdrawal may introduce positive reactivity in lower core. Significant at low power and low ORM.</p><div class="m-h2">2.4 Drive Limitations</div><p class="m-p">Max 40 rods simultaneously. Overheat 80°C. AZ-5 exempt.</p><div class="m-h2">2.5 Neutron Detector Ranges</div><p class="m-p">5 ranges: S / P / 1 / 2 / 3. 0.8s zero during switch.</p>';
        if (l === 'ru') return '<div class="m-head"><span>ГЛАВА 2</span><span>стр.5</span></div><div class="m-title-ru">РЕАКТИВНОСТЬ И СТЕРЖНИ</div><div class="m-title-cn">第2章 反应性与控制棒</div><div class="m-title-en">CHAPTER 2 · REACTIVITY</div><p class="m-p">B₄C / графит (~4,5 м) / вода (~1,25 м). Скорость 0,4 м/с. Концевой эффект. Макс. 40 стержней. 5 диапазонов.</p>';
        return '<div class="m-head"><span>ГЛАВА 2</span><span>стр.5</span></div><div class="m-title-ru">РЕАКТИВНОСТЬ И СТЕРЖНИ</div><div class="m-title-cn">第2章 反应性与控制棒</div><div class="m-title-en">CHAPTER 2 · REACTIVITY</div><div class="m-h2">2.1 控制棒结构</div><p class="m-p">B₄C吸收体 / 石墨置换体(~4.5 м) / 水柱(~1.25 м)。驱动速度 0.4 м/с。</p><div class="m-h2">2.2 端部效应</div><p class="m-p">提棒初期可能引入正反应性。低功率/低ОЗР时显著。</p><div class="m-h2">2.4 驱动限制</div><p class="m-p">同时最多 40 根，过热 80°C 闭锁，АЗ-5 豁免。</p><div class="m-h2">2.5 量程</div><p class="m-p">С/П/1/2/3 五档，切换 0.8s 归零。</p>';
      }
    },
    { ru: 'ГЛ.3 МОЩНОСТЬ', cn: '第3章 功率、周期与氙', en: 'Ch.3 Power, Period, Xenon', tab: '3 功率',
      body: () => '<div class="m-head"><span>ГЛАВА 3</span><span>стр.7</span></div><div class="m-title-ru">МОЩНОСТЬ, ПЕРИОД, КСЕНОН</div><div class="m-title-cn">第3章 功率、周期与氙</div><div class="m-title-en">CHAPTER 3 · POWER, PERIOD, XENON</div>' + (manualLang === 'en' ? '<div class="m-h2">3.1 Power and Period</div><p class="m-p">Period T = N/(dN/dt). P2 setpoint: period < 10 s → AZ-5.</p><div class="m-h2">3.2 Xenon-135</div><p class="m-p">Cross-section ~2.6×10⁶ barns. Iodine pit peak 6–10 h.</p><div class="m-h2">3.4 Void Coefficient</div><p class="m-p">Positive feedback. More boiling → more voids → more reactivity → more power.</p>' : (manualLang === 'ru' ? '<p class="m-p">T = N/(dN/dt). П2: период < 10 с → АЗ-5. Ксенон-135. Йодная яма. Положительный паровой коэффициент.</p>' : '<div class="m-h2">3.1 功率与周期</div><p class="m-p">T = N/(dN/dt)。П2 定值：周期 < 10 с → АЗ-5。</p><div class="m-h2">3.2 氙-135</div><p class="m-p">截面 ~2.6×10⁶ 靶恩。碘坑峰值 6–10h。</p><div class="m-h2">3.4 空泡效应</div><p class="m-p">正反馈。功率升 → 沸腾增 → 空泡增 → 反应性增 → 功率升。</p>')),
    },
    { ru: 'ГЛ.4 СЕПАРАТОРЫ', cn: '第4章 汽水分离器', en: 'Ch.4 Separators', tab: '4 分离器',
      body: () => '<div class="m-head"><span>ГЛАВА 4</span><span>стр.9</span></div><div class="m-title-ru">СЕПАРАТОРЫ И ПИТАТЕЛЬНАЯ ВОДА</div><div class="m-title-cn">第4章 汽水分离器与给水</div><div class="m-title-en">CHAPTER 4 · SEPARATORS AND FEEDWATER</div>' + (manualLang === 'en' ? '<div class="m-h2">4.1 Steam Separators</div><p class="m-p">Level 0.8–1.2 m. < 0.5 m → cavitation. < 0.2 m → dryout accident.</p><div class="m-h2">4.2 Feedwater Temperature</div><p class="m-p">Normal 270°C. ECCS → 40°C. Thermal shock at ΔT×flow > 150.</p>' : (manualLang === 'ru' ? '<p class="m-p">Уровень 0,8–1,2 м. < 0,5 м → кавитация. < 0,2 м → авария. T пит. воды 270 °C. САОР → 40 °C. Термоудар.</p>' : '<div class="m-h2">4.1 汽水分离器</div><p class="m-p">水位 0.8–1.2 m。< 0.5 m 泵降流量，< 0.3 m 气蚀，< 0.2 m 干烧。</p><div class="m-h2">4.2 给水温度</div><p class="m-p">正常 270°C。САОР → 40°C。热冲击 ΔT×流量 > 150 损伤。</p>')),
    },
    { ru: 'ГЛ.5 ТЕПЛОГИДРАВЛИКА', cn: '第5章 热工水力与包壳', en: 'Ch.5 Thermal Hydraulics', tab: '5 热工',
      body: () => '<div class="m-head"><span>ГЛАВА 5</span><span>стр.11</span></div><div class="m-title-ru">ТЕПЛОГИДРАВЛИКА И ОБОЛОЧКИ</div><div class="m-title-cn">第5章 热工水力与包壳</div><div class="m-title-en">CHAPTER 5 · THERMAL HYDRAULICS AND CLADDING</div>' + (manualLang === 'en' ? '<div class="m-h2">5.1 Cladding Integrity</div><p class="m-p">100–80% normal. 80–50% minor damage. < 10% fuel damage accident.</p>' : (manualLang === 'ru' ? '<p class="m-p">Целостность: 100–80% норма, 80–50% микро-повреждения, < 10% авария.</p>' : '<div class="m-h2">5.1 包壳完整性</div><p class="m-p">100–80% 正常，80–50% 微损，< 10% 燃料损坏事故。</p>')),
    },
    { ru: 'ГЛ.6 ОСТ. ТЕПЛО', cn: '第6章 衰变热', en: 'Ch.6 Decay Heat', tab: '6 衰变热',
      body: () => '<div class="m-head"><span>ГЛАВА 6</span><span>стр.12</span></div><div class="m-title-ru">ОСТАТОЧНОЕ ТЕПЛОВЫДЕЛЕНИЕ</div><div class="m-title-cn">第6章 衰变热与停堆冷却</div><div class="m-title-en">CHAPTER 6 · DECAY HEAT AND POST-SHUTDOWN COOLING</div>' + (manualLang === 'en' ? '<div class="m-h2">6.1 Decay Heat</div><p class="m-p">1s: 224 MW / 1min: 134 / 5min: 96 / 1h: 45.</p><div class="m-warn">⚠ Zero on meter ≠ no heat. Maintain circulation.</div>' : (manualLang === 'ru' ? '<p class="m-p">1 с: 224 МВт / 1 мин: 134 / 5 мин: 96 / 1 ч: 45.</p><div class="m-warn">⚠ Ноль ≠ нет тепла.</div>' : '<div class="m-h2">6.1 衰变热</div><p class="m-p">1s: 224 MW / 1min: 134 / 5min: 96 / 1h: 45。</p><div class="m-warn">⚠ 功率表归零 ≠ 没有热。保持冷却。</div>')),
    },
    { ru: 'ГЛ.7 АЗ', cn: '第7章 紧急保护', en: 'Ch.7 Emergency Protection', tab: '7 保护',
      body: () => {
        var l = manualLang;
        return '<div class="m-head"><span>ГЛАВА 7</span><span>стр.13</span></div><div class="m-title-ru">АВАРИЙНАЯ ЗАЩИТА</div><div class="m-title-cn">第7章 紧急保护系统</div><div class="m-title-en">CHAPTER 7 · EMERGENCY PROTECTION</div>'
          + (l === 'en' ? '<div class="m-h2">7.1 Protection Channels</div><table class="m-table"><tr><th>Channel</th><th>Setpoint</th></tr><tr onclick="Props.highlightLamp(\'P1\')" style="cursor:pointer;"><td><b>П1</b></td><td>power > 110%</td></tr><tr onclick="Props.highlightLamp(\'P2\')" style="cursor:pointer;"><td><b>П2</b></td><td>period < 10 s</td></tr><tr onclick="Props.highlightLamp(\'P3\')" style="cursor:pointer;"><td><b>П3</b></td><td>pressure > 7.25 MPa</td></tr><tr onclick="Props.highlightLamp(\'P4\')" style="cursor:pointer;"><td><b>П4</b></td><td>level out of limits</td></tr><tr onclick="Props.highlightLamp(\'P5\')" style="cursor:pointer;"><td><b>П5</b></td><td>channel rupture</td></tr></table><div class="m-h2">7.6 Alarm Acknowledgement (KVIT)</div><p class="m-p">Fast-flash 2Hz → KVIT → steady → slow-flash 0.5Hz → off.</p>'
          : (l === 'ru' ? '<div class="m-h2">7.1 Каналы защиты</div><p class="m-p">П1: >110% / П2: <10 с / П3: >7,25 МПа / П4: уровень / П5: разрушение. КВИТ: мигание 2 Гц → постоянно → 0,5 Гц → гаснет.</p>'
          : '<div class="m-h2">7.1 保护通道</div><table class="m-table"><tr><th>通道</th><th>定值</th></tr><tr onclick="Props.highlightLamp(\'P1\')" style="cursor:pointer;"><td><b>П1</b></td><td>功率 > 110%</td></tr><tr onclick="Props.highlightLamp(\'P2\')" style="cursor:pointer;"><td><b>П2</b></td><td>周期 < 10 с</td></tr><tr onclick="Props.highlightLamp(\'P3\')" style="cursor:pointer;"><td><b>П3</b></td><td>压力 > 7.25 МПа</td></tr><tr onclick="Props.highlightLamp(\'P4\')" style="cursor:pointer;"><td><b>П4</b></td><td>水位超限</td></tr><tr onclick="Props.highlightLamp(\'P5\')" style="cursor:pointer;"><td><b>П5</b></td><td>工艺管破损</td></tr></table><div class="m-h2">7.6 报警确认</div><p class="m-p">快闪2Гц → КВИТ → 常亮 → 慢闪0.5Гц → 灭。</p>'));
      }
    },
    { ru: 'ГЛ.8 ОЗР', cn: '第8章 运行限制与ОЗР', en: 'Ch.8 ORM', tab: '8 ОЗР',
      body: () => '<div class="m-head"><span>ГЛАВА 8</span><span>стр.14</span></div><div class="m-title-ru">ПРЕДЕЛЫ И ОЗР</div><div class="m-title-cn">第8章 运行限制与ОЗР</div><div class="m-title-en">CHAPTER 8 · OPERATING LIMITS AND ORM</div>' + (manualLang === 'en' ? '<div class="m-h2">8.2 Limits</div><p class="m-p">ORM ≥ 15: operation permitted. ORM < 15: reduce/shutdown. ORM < 8: immediate shutdown.</p><div class="m-warn">⚠ Low power + high xenon + high rod position = minimum ORM.</div>' : (manualLang === 'ru' ? '<p class="m-p">ОЗР ≥ 15: разрешено. < 15: снижение. < 8: останов.</p><div class="m-warn">⚠ Малая мощность + высокий Xe + верхнее положение = минимум ОЗР.</div>' : '<div class="m-h2">8.2 限值</div><p class="m-p">ОЗР ≥ 15: 允许运行。ОЗР < 15: 降功率/停堆。ОЗР < 8: 立即停堆。</p><div class="m-warn">⚠ 低功率 + 高氙 + 高棒位 = ОЗР 最小化。</div>')),
    },
    { ru: 'ГЛ.9 ПРИБОРЫ', cn: '第9章 仪表系统', en: 'Ch.9 Instrumentation', tab: '9 仪表',
      body: () => '<div class="m-head"><span>ГЛАВА 9</span><span>стр.15</span></div><div class="m-title-ru">ПРИБОРЫ И СИСТЕМА КОНТРОЛЯ</div><div class="m-title-cn">第9章 仪表与监测系统</div><div class="m-title-en">CHAPTER 9 · INSTRUMENTATION</div>' + (manualLang === 'en' ? '<div class="m-h2">9.1 Instrument Dynamics</div><p class="m-p">Time constants: power 0.5s / period 1.0 / outlet temp 3.0 / sep. pressure 2.0 / sep. level 1.5 / ORM 0.2 / dosimeter 5.0.</p><div class="m-h2">9.2 Failure Modes</div><p class="m-p">Stuck / Drift / Pegged / Jitter / Reverse / Dead.</p>' : (manualLang === 'ru' ? '<p class="m-p">Постоянные времени: 0,5 с / 1,0 / 3,0 / 2,0 / 1,5 / 0,2 / 5,0 с. Отказы: залипание, дрейф, заклинивание, дрожание, обратный ход, обрыв.</p>' : '<div class="m-h2">9.1 仪表动态</div><p class="m-p">τ: 功率0.5s / 周期1.0 / 水温3.0 / 分离器压力2.0 / 水位1.5 / ОЗР0.2 / 剂量仪5.0。</p><div class="m-h2">9.2 故障模式</div><p class="m-p">卡死/漂移/打表/跳动/反向/死表。</p>')),
    },
    { ru: 'ГЛ.10 РАДИАЦИЯ', cn: '第10章 辐射监测', en: 'Ch.10 Radiation', tab: '10 辐射',
      body: () => '<div class="m-head"><span>ГЛАВА 10</span><span>стр.16</span></div><div class="m-title-ru">РАДИАЦИОННЫЙ КОНТРОЛЬ</div><div class="m-title-cn">第10章 辐射监测</div><div class="m-title-en">CHAPTER 10 · RADIATION MONITORING</div>' + (manualLang === 'en' ? '<div class="m-h2">10.1 Normal Background</div><p class="m-p">Control room dose rate ~0.1 mR/h. Coolant activity ~10³ Bq/m³.</p><div class="m-h2">10.3 Dosimeter DP-5V</div><p class="m-p">Ranges ×1–×10000. Response time 5s.</p>' : (manualLang === 'ru' ? '<p class="m-p">Доза в ГЩУ ~0,1 мР/ч. ДП-5В: диапазоны ×1–×10000, инерционность 5 с.</p>' : '<div class="m-h2">10.1 正常本底</div><p class="m-p">主控室剂量率 ~0.1 мР/ч。冷却剂活度 ~10³ Бк/м³。</p><div class="m-h2">10.3 剂量仪 ДП-5В</div><p class="m-p">量程 ×1–×10000。响应时间 5s。</p>')),
    },
    { ru: 'ГЛ.11 ОПЕРАЦИИ', cn: '第11章 操作程序', en: 'Ch.11 Operations', tab: '11 操作',
      body: () => '<div class="m-head"><span>ГЛАВА 11</span><span>стр.17</span></div><div class="m-title-ru">НОРМАЛЬНЫЕ ОПЕРАЦИИ</div><div class="m-title-cn">第11章 正常操作程序</div><div class="m-title-en">CHAPTER 11 · NORMAL OPERATING PROCEDURES</div>' + (manualLang === 'en' ? '<div class="m-h2">11.1 Startup</div><ul class="m-checklist" onclick="Props.toggleCheck(event)"><li>ORM ≥ 15 rods</li><li>Protections engaged</li><li>MCP ≥ 6</li><li>Sep. level 0.8–1.2 m</li><li>Feedwater > 250 °C</li><li>Drive temp < 60 °C</li><li>Select range</li><li>Withdraw rods at 0.4 %/s</li><li>Period T > 60 s</li><li>Stabilise at 10%</li></ul>' : (manualLang === 'ru' ? '<p class="m-p">□ ОЗР ≥ 15 / □ защиты включены / □ ГЦН ≥ 6 / □ уровень 0,8–1,2 м / □ T пит. воды > 250 °C</p>' : '<div class="m-h2">11.1 启动序列</div><ul class="m-checklist" onclick="Props.toggleCheck(event)"><li>ОЗР ≥ 15</li><li>保护全部投入</li><li>泵 ≥ 6 台</li><li>水位 0.8–1.2 м</li><li>给水温度 > 250 °C</li><li>驱动温度 < 60 °C</li><li>选择量程</li><li>0.4 %/с 提棒</li><li>周期 T > 60 с</li><li>10% 稳定</li></ul>')),
    },
    { ru: 'ГЛ.12 АВАРИИ', cn: '第12章 事故处理', en: 'Ch.12 Accidents', tab: '12 事故',
      body: () => '<div class="m-head"><span>ГЛАВА 12</span><span>стр.18</span></div><div class="m-title-ru">АВАРИЙНЫЕ РЕЖИМЫ</div><div class="m-title-cn">第12章 异常工况与事故</div><div class="m-title-en">CHAPTER 12 · ABNORMAL CONDITIONS</div>' + (manualLang === 'en' ? '<div class="m-h2">12.1 Xenon Oscillation</div><p class="m-p">Cease rod withdrawal. At N > 110% — P1.</p><div class="m-h2">12.5 Drive Overheat + Rising Power</div><p class="m-p">If protections bypassed — manual AZ-5 immediately.</p>' : (manualLang === 'ru' ? '<p class="m-p">Ксеноновые колебания: прекратить извлечение. Потеря расхода: П1/АЗ-5. Перегрев + рост N: ручная АЗ-5.</p>' : '<div class="m-h2">12.1 氙振荡</div><p class="m-p">停止提棒。功率 > 110% 确认 П1。</p><div class="m-h2">12.5 驱动过热+功率上升</div><p class="m-p">保护旁路时 → 手动 АЗ-5。</p>')),
    },
    // 14-16: Appendices
    { ru: 'ПРИЛ. А', cn: '附录A 定值表', en: 'APP. A Setpoints', tab: 'A 定值',
      body: () => '<div class="m-head"><span>ПРИЛОЖЕНИЕ А</span><span>стр.19</span></div><div class="m-title-ru">УСТАВКИ ЗАЩИТЫ</div><div class="m-title-cn">附录A · 保护定值表</div><div class="m-title-en">APPENDIX A · PROTECTION SETPOINTS</div><table class="m-table"><tr><th>通道</th><th>参数</th><th>定值</th><th>动作</th></tr><tr><td>П1</td><td>中子功率</td><td>> 110%</td><td>АЗ-5</td></tr><tr><td>П2</td><td>周期</td><td>< 10 с</td><td>АЗ-5</td></tr><tr><td>П3</td><td>分离器压力</td><td>> 7.25 МПа</td><td>АЗ-5</td></tr><tr><td>П4</td><td>分离器水位</td><td>超限</td><td>АЗ-5</td></tr><tr><td>П5</td><td>工艺管破损</td><td>放射性 ↑</td><td>АЗ-5</td></tr><tr style="background:rgba(232,164,24,0.12);"><td>ОЗР</td><td>操作裕度</td><td>< 15 根</td><td>降功率/停堆</td></tr><tr style="background:rgba(194,36,16,0.1);"><td>ОЗР</td><td>操作裕度</td><td>< 8 根</td><td><b>立即停堆</b></td></tr><tr><td>水位</td><td>分离器</td><td>< 0.2 м 且 P > 10%</td><td>事故停堆</td></tr><tr><td>包壳</td><td>完整性</td><td>< 10%</td><td>燃料损坏</td></tr><tr><td>驱动</td><td>温度</td><td>> 80 °C</td><td>闭锁</td></tr></table>',
    },
    { ru: 'ПРИЛ. Б', cn: '附录B 缩略语', en: 'APP. B Abbreviations', tab: 'B 缩略',
      body: () => '<div class="m-head"><span>ПРИЛОЖЕНИЕ Б</span><span>стр.20</span></div><div class="m-title-ru">СОКРАЩЕНИЯ</div><div class="m-title-cn">附录B · 缩略语</div><div class="m-title-en">APPENDIX B · ABBREVIATIONS</div><table class="m-table"><tr><th>缩写</th><th>俄文</th><th>中文</th></tr><tr><td>АЗ</td><td>Аварийная Защита</td><td>紧急保护</td></tr><tr><td>ГЦН</td><td>Главный Цирк. Насос</td><td>主循环泵</td></tr><tr><td>ОЗР</td><td>Оперативный Запас Реактивности</td><td>操作反应性裕度</td></tr><tr><td>ТК</td><td>Технологический Канал</td><td>工艺管</td></tr><tr><td>ДС</td><td>Дренажный Сепаратор</td><td>汽水分离器</td></tr><tr><td>САОР</td><td>Система Авар. Охлаждения</td><td>应急堆芯冷却</td></tr><tr><td>КВИТ</td><td>Квитирование</td><td>报警确认</td></tr><tr><td>КСУ</td><td>Комплексная Система Управления</td><td>自记记录仪</td></tr></table>',
    },
    { ru: 'ПРИЛ. В', cn: '附录C 修改通知', en: 'APP. C Amendments', tab: 'C 修改',
      body: () => {
        var l = manualLang;
        var n1 = l === 'en' ? 'Amendment No. 12 · 15.03.1984' : (l === 'ru' ? 'ИЗВЕЩЕНИЕ № 12 · 15.03.1984' : '修改通知 №12 · 15.03.1984');
        var n2 = l === 'en' ? 'Amendment No. 13 · 02.08.1986' : (l === 'ru' ? 'ИЗВЕЩЕНИЕ № 13 · 02.08.1986' : '修改通知 №13 · 02.08.1986');
        var added = l === 'en' ? 'Added: Ch.4–6, 9–10; §2.4, §2.5, §3.5; §7.2, §7.6' : (l === 'ru' ? 'Внесены: гл.4–6, 9–10; §2.4, §2.5, §3.5; §7.2, §7.6' : '新增：第4–6、9–10章；§2.4、§2.5、§3.5；§7.2、§7.6');
        var note1 = l === 'en' ? 'The operator shall strictly observe ORM limits.' : (l === 'ru' ? 'Оператор обязан строго соблюдать пределы ОЗР.' : '操作员应严格遵守 ОЗР 限值规定。');
        var note2_1 = l === 'en' ? 'The shift supervisor said continue. ORM is only 8 rods.' : (l === 'ru' ? 'НС сказал продолжать. ОЗР всего 8 стержней.' : '值长说继续。ОЗР 只剩 8 根。');
        var note2_2 = l === 'en' ? 'I objected. It\'s in the log.' : (l === 'ru' ? 'Я возразил, записал в журнал.' : '我提了反对，记录在日志里。');
        var note2_3 = l === 'en' ? 'Section 4.3 has been crossed out. Nobody told us AZ-5 would raise power first.' : (l === 'ru' ? 'Пункт 4.3 зачёркнут. Никто не сказал нам, что АЗ-5 сначала поднимет мощность.' : '规程 4.3 被涂掉了。没人告诉我们 АЗ-5 会先升功率。');
        var note2_4 = l === 'en' ? 'If you are reading this manual: never operate with ORM < 15. Never.' : (l === 'ru' ? 'Если ты читаешь этот регламент: никогда не работай при ОЗР < 15. Никогда.' : '如果你看到这本手册：永远不要在 ОЗР < 15 时运行。永远不要。');
        return '<div class="m-head"><span>ПРИЛОЖЕНИЕ В</span><span>стр.21</span></div><div class="m-title-ru">ИЗВЕЩЕНИЯ ОБ ИЗМЕНЕНИИ</div><div class="m-title-cn">附录C · 修改通知</div><div class="m-title-en">APPENDIX C · AMENDMENT NOTICES</div>'
          + '<div style="border:2px solid #8a8474;padding:12px;margin:14px 0;background:#e8e0c8;"><div style="font-size:11px;font-weight:700;letter-spacing:1px;">' + n1 + '</div><p class="m-redact" style="display:block;margin-top:8px;">████████████████████████████████████</p><p class="m-redact" style="display:block;">████ Положительный выбег при останове ████████</p><p class="m-redact" style="display:block;">████ По указанию руководства ████████ не публикуется ████████</p><p style="font-size:11px;margin-top:8px;">' + note1 + '</p></div>'
          + '<div style="border-top:1px dashed #b8b2a0;padding-top:12px;"><div style="font-size:11px;font-weight:700;letter-spacing:1px;">' + n2 + '</div><p style="font-size:10px;color:#8a8474;margin:4px 0;">' + added + '</p>'
          + '<div style="font-family:var(--f-hand);font-size:17px;color:#3a4a6a;line-height:1.6;margin-top:8px;">&ldquo;01:03 — ' + note2_1 + '<br>' + note2_2 + '&rdquo;<br><br>&ldquo;' + note2_3 + '&rdquo;<br><br>&ldquo;' + note2_4 + '&rdquo;</div>'
          + '<div style="text-align:right;font-size:10px;color:#8a8474;margin-top:6px;">— А. · 26.04.1986 00:45</div></div>';
      }
    },
  ];

  let manualPage = 0;
  let manualLang = 'zh';

  function renderManual() {
    const p = MANUAL[manualPage];
    const pg = gt('manual-page');
    pg.innerHTML = p.body();
    if (pg) pg.setAttribute('data-lang', manualLang);
    gt('manual-pageno').textContent = (manualPage + 1) + ' / ' + MANUAL.length;
    gt('manual-spine').innerHTML = MANUAL.map(function(pg, i) {
      return '<div class="spine-tab' + (i === manualPage ? ' active' : '') + '" onclick="Props.gotoPage(' + i + ')">' + pg.tab + '</div>';
    }).join('');
    if (window.App && App.notifyManualPage) App.notifyManualPage(manualPage);
  }

  function openManual() {
    gt('manual-overlay').classList.remove('hidden');
    renderManual();
    if (window.App && App.initManualCanvas) App.initManualCanvas();
  }
  function closeManual() {
    gt('manual-overlay').classList.add('hidden');
    if (window.App && App.resizeManualCanvas) App.resizeManualCanvas();
  }

  let clipTool = 'pen';
  const CLIP_KEY = 'rbmk_journal_notes';
  function loadClip() {
    try {
      const raw = localStorage.getItem(CLIP_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && typeof d.name === 'string' && Array.isArray(d.lines)) return d;
      }
    } catch (e) {}
    return { name: '', lines: [] };
  }
  function saveClip() {
    const name = (gt('clip-name') && gt('clip-name').value) || '';
    const lines = Array.from(document.querySelectorAll('.clip-line')).map(function(el) { return el.value; });
    const d = { name: name, lines: lines };
    try { localStorage.setItem(CLIP_KEY, JSON.stringify(d)); } catch (e) {}
  }
  function openClipboard() {
    const saved = loadClip();
    var lines = '';
    for (var i = 0; i < 12; i++) {
      const v = (saved.lines && saved.lines[i]) || '';
      lines += '<input class="clip-line' + (clipTool === 'pencil' ? ' pencil' : '') + '" value="' + v.replace(/"/g, '&quot;') + '" placeholder="' + (i === 0 ? '\u5728\u6B64\u4E66\u5199\u2026' : '') + '">';
    }
    showProp(
      '<div class="clipboard"><div class="clipboard-clip"></div><div class="clip-paper">'
      + '<div class="clip-header">\u0427\u0415\u0420\u041D\u041E\u0411\u042B\u041B\u042C\u0421\u041A\u0410\u042F \u0410\u042D\u0421 \u00B7 \u0411\u041B\u041E\u041A \u21164 \u00B7 \u041E\u041F\u0415\u0420\u0410\u0422\u0418\u0412\u041D\u042B\u0419 \u0416\u0423\u0420\u041D\u0410\u041B \u503C\u73ED\u65E5\u5FD7<br>'
      + 'Date: 26.04.1986   Operator: <input id="clip-name" value="' + (saved.name || '').replace(/"/g, '&quot;') + '" placeholder="\u7B7E\u540D">'
      + '</div>' + lines + '</div>'
      + '<div class="clip-tools">'
      + '<button onclick="Props.setClipTool(\'pen\')">\u2712 \u94A2\u7B14</button>'
      + '<button onclick="Props.setClipTool(\'pencil\')">\u270F \u94C5\u7B14</button>'
      + '<button onclick="Props.exportClip()">\u2398 \u5BFC\u51FA</button>'
      + '<button onclick="Props.closeProp()">\u2715 \u653E\u56DE</button></div></div>');
  }
  function setClipTool(t) {
    clipTool = t;
    document.querySelectorAll('.clip-line').forEach(function(el) {
      el.classList.toggle('pencil', t === 'pencil');
    });
    document.querySelectorAll('.clip-tools button').forEach(function(b) { b.classList.remove('active'); });
    if (event && event.target) event.target.classList.add('active');
  }
  function exportClip() {
    const name = (gt('clip-name') && gt('clip-name').value) || '\u672A\u7F72\u540D';
    const lines = Array.from(document.querySelectorAll('.clip-line'))
      .map(function(el) { return el.value; }).filter(function(v) { return v.trim(); });
    const text = '\u2550\u2550\u2550 \u041E\u041F\u0415\u0420\u0410\u0422\u0418\u0412\u041D\u042B\u0419 \u0416\u0423\u0420\u041D\u0410\u041B \u00B7 \u503C\u73ED\u65E5\u5FD7 26.04.1986 \u2550\u2550\u2550\nOperator \u00B7 \u64CD\u7EB5\u5458: ' + name + '\n\n' + lines.join('\n') + '\n\n(\u5BFC\u51FA\u81EA \u0420\u0411\u041C\u041A-1000 \u4EFF\u771F\u5668 \u00B7 \u6A21\u62DF\u5668\u5BFC\u51FA)';
    if (navigator.clipboard) navigator.clipboard.writeText(text);
    alert('\u65E5\u5FD7\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F');
  }

  let calcDisp = '0', calcAcc = null, calcOp = null, calcNew = true, calcMem = 0;
  function calcShow() {
    const el = gt('calc-screen');
    if (el) el.textContent = calcDisp.length > 10 ? Number(calcDisp).toExponential(4) : calcDisp;
  }
  function calcKey(k) {
    if (k >= '0' && k <= '9') {
      if (calcNew) { calcDisp = k; calcNew = false; }
      else calcDisp = calcDisp === '0' ? k : calcDisp + k;
    } else if (k === '.') {
      if (calcNew) { calcDisp = '0.'; calcNew = false; }
      else if (calcDisp.indexOf('.') < 0) calcDisp += '.';
    } else if (k === 'C') {
      calcDisp = '0'; calcAcc = null; calcOp = null; calcNew = true;
    } else if (k === '\u00B1') {
      calcDisp = String(-parseFloat(calcDisp));
    } else if (k === '\u221A') {
      calcDisp = String(Math.sqrt(parseFloat(calcDisp)));
      calcNew = true;
    } else if (k === 'OPR') {
      calcDisp = String(RBMK.S.opr); calcNew = true;
    } else if (k === 'Xe') {
      calcDisp = RBMK.S.xe.toFixed(3); calcNew = true;
    } else if (k === 'M+') {
      calcMem += parseFloat(calcDisp);
    } else if (k === 'MR') {
      calcDisp = String(calcMem); calcNew = true;
    } else if (['+', '\u2212', '\u00D7', '\u00F7'].includes(k)) {
      if (calcAcc !== null && calcOp && !calcNew) calcEquals();
      calcAcc = parseFloat(calcDisp); calcOp = k; calcNew = true;
    } else if (k === '=') {
      calcEquals();
    }
    calcShow();
  }
  function calcEquals() {
    if (calcAcc === null || !calcOp) return;
    const b = parseFloat(calcDisp);
    let r = 0;
    switch (calcOp) {
      case '+': r = calcAcc + b; break;
      case '\u2212': r = calcAcc - b; break;
      case '\u00D7': r = calcAcc * b; break;
      case '\u00F7': r = b === 0 ? NaN : calcAcc / b; break;
    }
    calcDisp = isNaN(r) ? 'ERROR' : String(Math.round(r * 1e8) / 1e8);
    calcAcc = null; calcOp = null; calcNew = true;
  }
  function openCalculator() {
    const rows = [['7','8','9','\u00F7','C'],['4','5','6','\u00D7','\u221A'],['1','2','3','\u2212','OPR'],['0','.','\u00B1','+','Xe'],['M+','MR','','','']];
    var html = '<div class="calc"><div class="calc-brand">\u042D\u041B\u0415\u041A\u0422\u0420\u041E\u041D\u0418\u041A\u0410 \u00B7 \u041C\u041A-61</div>'
      + '<div class="calc-screen" id="calc-screen">0</div><div class="calc-keys">';
    rows.forEach(function(row) {
      row.forEach(function(k) {
        if (k === '') html += '<span></span>';
        else {
          var cls = 'opr'.indexOf(k) >= 0 ? 'opr' : (k === 'Xe' ? 'xe' : 'fn');
          html += '<button class="' + cls + '" onclick="Props.calcKey(\'' + k + '\')">' + k + '</button>';
        }
      });
    });
    html += '</div></div>';
    showProp(html);
    calcShow();
  }

  let dosiRange = 1;
  function fmtDose(v) {
    if (v >= 1e6) return (v / 1e6).toFixed(2) + ' \u0417\u0432/\u0447';
    if (v >= 1e3) return (v / 1e3).toFixed(2) + ' \u043C\u0417\u0432/\u0447';
    return v.toFixed(2) + ' \u043C\u043A\u0417\u0432/\u0447';
  }
  function openDosimeter() {
    showProp(
      '<div class="dosimeter"><div class="dosi-brand">\u0418\u041C\u0414 \u00B7 \u0414\u041F-5\u0412</div>'
      + '<div class="dosi-screen"><canvas id="dosi-canvas" width="300" height="90"></canvas>'
      + '<div class="dosi-readout" id="dosi-readout">&mdash;</div></div>'
      + '<div class="dosi-range">'
      + [1,2,3,4,5].map(function(r) { return '<button class="' + (r === dosiRange ? 'active' : '') + '" onclick="Props.setDosiRange(' + r + ')">\u00D7' + ['1','10','100','1k','10k'][r-1] + '</button>'; }).join('')
      + '</div><div class="dosi-accum" style="text-align:center;font-family:monospace;font-size:11px;margin-top:8px;color:#2e2e1a;">\u7D2F\u79EF: <span id="dosi-total">&mdash;</span></div>'
      + '<div class="dosi-click" id="dosi-click">\u00B7 \u00B7 \u00B7</div>'
      + '<div class="clip-tools" style="margin-top:10px;"><button onclick="Props.closeProp()">\u2715 \u653E\u56DE</button></div></div>');
    updateDosimeter();
  }
  function setDosiRange(r) {
    dosiRange = r;
    document.querySelectorAll('.dosi-range button').forEach(function(b, i) {
      b.classList.toggle('active', i + 1 === r);
    });
    updateDosimeter();
  }
  function updateDosimeter() {
    const el = gt('dosi-readout');
    if (!el) return;
    const S = RBMK.S;
    if (typeof Audio !== 'undefined' && Audio.getGeiger) {
      try {
        const g = Audio.getGeiger();
        g.setDoseRate(S.doseRate);
        if (!g.running) g.start();
      } catch (e) {}
    }
    el.textContent = fmtDose(S.doseRate);
    el.style.color = S.doseRate > 1000 ? '#8a1f14' : '#2e2e1a';
    const tot = gt('dosi-total');
    if (tot) tot.textContent = S.doseTotal >= 1000 ? (S.doseTotal / 1000).toFixed(2) + ' \u043C\u0417\u0432' : S.doseTotal.toFixed(2) + ' \u043C\u043A\u0417\u0432';
    const cv = gt('dosi-canvas');
    if (cv) {
      const ctx = cv.getContext('2d');
      const W = cv.width, H = cv.height;
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H - 8, R = H - 8;
      ctx.strokeStyle = '#2e2e1a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, R - 14, Math.PI, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI + (i / 10) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * (R - 14), cy + Math.sin(a) * (R - 14));
        ctx.lineTo(cx + Math.cos(a) * (R - 22), cy + Math.sin(a) * (R - 22));
        ctx.stroke();
      }
      ctx.strokeStyle = '#c22410';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, R - 18, Math.PI * 1.7, Math.PI * 2);
      ctx.stroke();
      const maxVal = Math.pow(10, dosiRange * 1.2);
      let f = Math.log10(Math.max(0.01, S.doseRate)) / Math.log10(maxVal);
      f = Math.max(0, Math.min(1.02, f));
      const a = Math.PI + f * Math.PI;
      ctx.strokeStyle = '#c22410';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * (R - 16), cy + Math.sin(a) * (R - 16));
      ctx.stroke();
    }
    const click = gt('dosi-click');
    if (click) {
      const rate = Math.min(20, Math.log10(S.doseRate + 1) * 4);
      click.textContent = '\u5494\u560D '.repeat(Math.max(1, Math.round(rate))).trim() || '\u00B7 \u00B7 \u00B7';
    }
  }

  let phoneLifted = false;
  const PHONE_LINES = [
    { num: '0701', from: '\u8C03\u5EA6\u5458', text: '\u56DB\u53F7\u673A\u7EC4\uFF0C\u6B63\u5728\u542C\u3002\u4ECA\u665A\u8425\u5BA6\u5DF2\u7ECF\u660E\u786E\uFF1A\u7EF4\u6301\u53F0\u4E0A\u529F\u7387\uFF0C\u65E0\u8BBA\u5982\u4F55\u4E0D\u5F97\u4F4E\u4E8E\u4E0A\u7EA7\u8981\u6C42\u3002\u6709\u4E8B\u968F\u65F6\u62A5\u3002' },
    { num: '0702', from: '\u8C03\u5EA6\u5458', text: '\u4ECA\u665A\u4F60\u4EEC\u54EA\u91CC\u600E\u4E48\u6837\uFF1F\u6CE8\u610F\u516D\u53F7\u673A\u7EC4\u4ECA\u665A\u4E5F\u5728\u8F6C\u8BD5\uFF0C\u7EBF\u8DEF\u8981\u6C42\u5DF2\u53D1\u3002\u7B49\u4F60\u4EEC\u4F20\u5408\u95F8\u5408\u683C\u3002' },
    { num: '0703', from: '\u8C03\u5EA6\u5458', text: '\u677F\u5357\u8F93\u7535\u5DE5\u6321\u53F4\uFF1F\u6211\u8FD9\u8FB9\u53EF\u4EE5\u7684\u53D9\uFF0C\u4F60\u5148\u628A\u529F\u7387\u62C9\u4E0A\u53BB\u518D\u8BF4\u3002' },
    { num: '0704', from: '\u4F9B\u5E94\u79D1', text: '\u65B0\u4E00\u6279\u6CB8\u6CE1\u7BA1\u660E\u5929\u4E0B\u5348\u5230\u3002\u4F60\u4EEC\u5C0F\u5FC3\u70B9\u7528\uFF0C\u79EF\u538B\u5802\u5DF2\u7ECF\u6302\u4E86\u4E24\u4E2A\u6708\u7684\u8D26\u3002' },
    { num: '0705', from: '\u0421\u0435\u043C\u0451\u043D\u043E\u0432 \u00B7 \u8C22\u8292\u8BFA\u592B', text: '\u6211\u4E0A\u4E00\u73ED\uFF0C\u7ED9\u4F60\u7559\u4E86\u8BC1\u636E\u5728\u65E5\u5FD7\u91CC\u3002\u4ECA\u665A\u629E\u7B7D\u64CD\u8D31\u98CE\uFF0C\u624B\u5E95\u4E0B\u6CE8\u610F\u3002' },
  ];
  const PHONE_BOOK = [
    { num: '0701', name: '\u8C03\u5EA6\u53F0 \u00B7 \u0414\u0418\u0421\u041F\u0415\u0422\u0427\u0415\u0420' },
    { num: '0702', name: '\u6C7D\u8F6E\u673A\u8F66\u95F4 \u00B7 \u0422\u0423\u0420\u0411\u0418\u041D\u041D\u042B\u0419 \u0426\u0415\u0425' },
    { num: '0703', name: '\u7535\u6C14\u8F66\u95F4 \u00B7 \u042D\u041B\u0415\u041A\u0422\u0420\u041E\u0426\u0415\u0425' },
    { num: '0704', name: '\u6D88\u9632\u961F \u00B7 \u041F\u041E\u0416\u0410\u0420\u041D\u0410\u042F \u0427\u0410\u0421\u0422\u042C' },
    { num: '0705', name: '\u533B\u7597\u70B9 \u00B7 \u041C\u0415\u0414\u041F\u0423\u041D\u041A\u0422' },
  ];
  function openPhone() {
    phoneLifted = false;
    showProp(
      '<div class="phone" id="phone-body">'
      + '<div class="phone-handset" id="phone-handset" onclick="Props.togglePhone()"><span class="hs-ear">\uD83D\uDCAC</span><span class="hs-cord"></span></div>'
      + '<div class="phone-dial">'
      + ['1','2','3','4','5','6','7','8','9','*','0','#'].map(function(k) {
          return '<button class="dial-key" data-key="' + k + '" onclick="Props.phoneKey(\'' + k + '\')">' + k + '</button>';
        }).join('')
      + '</div>'
      + '<div class="phone-call-row">'
      + '<button class="phone-call" onclick="Props.phoneCall()">\u260E \u62E8\u53F7</button>'
      + '<button class="phone-hang" onclick="Props.phoneHang()">\u2715 \u6302\u65AD</button>'
      + '</div>'
      + '<div class="phone-label">\u0412\u0427 \u00B7 \u0410\u042D\u0421-4 \u00B7 \u0414\u0418\u0421\u041F\u0415\u0422\u0427\u0415\u0420 \u8C03\u5EA6\u53F0</div>'
      + '<div class="phone-status" id="phone-status">&mdash; \u7EBF\u8DEF\u7A7A\u95F2 &mdash;</div>'
      + '<div class="phone-line" id="phone-line" style="display:none;"></div>'
      + '<div class="phone-hint"><i>\u53F7\u7801\u8BF7\u67E5\u9605\u684C\u4E0A\u7684\u7535\u8BDD\u53F7\u7801\u7C3F</i></div>'
      + '<div class="clip-tools" style="margin-top:12px;"><button onclick="Props.closeProp()">\u2715 \u653E\u56DE</button></div></div>');
  }
  function openPhonebook() {
    showProp(
      '<div class="phonebook" id="phonebook-body">'
      + '<div class="pb-title">\u0422\u0415\u041B\u0415\u0424\u041E\u041D\u041D\u0410\u042F \u041A\u041D\u0418\u0413\u0410 \u00B7 \u7535\u8BDD\u53F7\u7801\u7C3F <i>\u70B9\u51FB\u76F4\u63A5\u62E8\u53F7</i></div>'
      + '<div class="pb-sub">\u0410\u042D\u0421-4 \u00B7 \u5185\u90E8\u603B\u673A\uFF1A0 \u2192 4</div>'
      + PHONE_BOOK.map(function(pb, i) {
          return '<div class="pb-entry" onclick="Props.phoneBook(' + i + ')"><b>' + pb.num + '</b><span>' + pb.name + '</span></div>';
        }).join('')
      + '<div class="pb-note">\u62E8\u6253\u524D\u8BF7\u5148\u62FF\u8D77\u8C03\u5EA6\u53F0\u7535\u8BDD\u3002\u5DF2\u4E0D\u5728\u670D\u52A1\u7684\u7AEF\u53E3\u4E0D\u4F1A\u63A5\u901A\u3002</div>'
      + '<div class="clip-tools" style="margin-top:12px;"><button onclick="Props.closeProp()">\u2715 \u653E\u56DE</button></div></div>');
  }
  function phoneBook(i) {
    const pb = PHONE_BOOK[i];
    if (!pb) return;
    if (openProp !== 'phone') { openProp = 'phone'; openPhone(); }
    if (!phoneLifted) togglePhone();
    const line = gt('phone-line');
    if (line) {
      line.style.display = 'block';
      line.textContent = pb.num;
    }
    phoneCall();
  }
  function phoneKey(k) {
    if (!phoneLifted) return;
    const line = gt('phone-line');
    if (line) {
      line.style.display = 'block';
      line.textContent += k;
      if (typeof Audio !== 'undefined' && Audio.click) Audio.click();
    }
  }
  function phoneCall() {
    if (!phoneLifted) return;
    const st = gt('phone-status');
    const line = gt('phone-line');
    const digits = line ? String(line.textContent).replace(/\D/g, '') : '';
    if (!digits) {
      if (st) st.textContent = '\u00AB\u8BF7\u5148\u62E8\u53F7\u518D\u6309\u901A\u8BDD\u952E\u00BB \u00B7 \u043D\u0430\u0431\u0435\u0440\u0438\u0442\u0435 \u043D\u043E\u043C\u0435\u0440';
      if (typeof Audio !== 'undefined' && Audio.beep) Audio.beep(330, 0.18, 0.05);
      return;
    }
    if (st) st.textContent = '\u00AB\u62E8\u53F7\u4E2D\u00BB \u00B7 \u0432\u044B\u0437\u043E\u0432...';
    if (typeof Audio !== 'undefined') {
      if (Audio.playKeyTurn) Audio.playKeyTurn();
    }
    let resp = null;
    for (let i = 0; i < PHONE_LINES.length; i++) {
      if (PHONE_LINES[i].num === digits) { resp = PHONE_LINES[i]; break; }
    }
    if (!resp) {
      setTimeout(function() {
        const st2 = gt('phone-status');
        if (!st2) return;
        st2.textContent = '\u00AB\u7A7A\u53F7 \u00B7 \u65E0\u6CD5\u63A5\u901A \u00BB \u043D\u043E\u043C\u0435\u0440 \u043D\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442';
        const ln = gt('phone-line');
        if (ln) ln.innerHTML = '<span class="pl-text">\u62E8\u6253\u7684\u53F7\u7801\u4E0D\u5B58\u5728\u3002\u8BF7\u6838\u5BF9\u684C\u4E0A\u7684\u7535\u8BDD\u53F7\u7801\u7C3F\u3002</span>';
        if (typeof Audio !== 'undefined' && Audio.beep) {
          Audio.beep(425, 0.22, 0.05);
          setTimeout(function() { if (typeof Audio !== 'undefined' && Audio.beep) Audio.beep(425, 0.22, 0.05); }, 500);
        }
      }, 900);
      return;
    }
    setTimeout(function() {
      const st2 = gt('phone-status');
      if (!st2) return;
      st2.textContent = '\u00AB\u5DF2\u63A5\u901A \u00B7 \u0441\u043E\u0435\u0434\u0438\u043D\u0435\u043D\u043E\u00BB';
      const ln = gt('phone-line');
      if (ln) ln.innerHTML = '<b class="pl-from">' + resp.from + '</b><span class="pl-text">' + resp.text + '</span>';
      if (typeof Audio !== 'undefined') {
        if (Audio.voice) Audio.voice(900, 0.5, 0.06);
        else if (Audio.playVoice) Audio.playVoice();
        else if (Audio.beep) Audio.beep(700, 0.4, 0.08);
      }
    }, 900);
  }
  function phoneHang() {
    phoneLifted = false;
    const h = gt('phone-handset');
    const st = gt('phone-status');
    const ln = gt('phone-line');
    if (h) h.classList.remove('lifted');
    if (st) st.textContent = '&mdash; \u7EBF\u8DEF\u7A7A\u95F2 &mdash;';
    if (ln) { ln.style.display = 'none'; ln.innerHTML = ''; }
    if (typeof Audio !== 'undefined' && Audio.click) Audio.click();
  }
  function togglePhone() {
    phoneLifted = !phoneLifted;
    const h = gt('phone-handset');
    const st = gt('phone-status');
    const ln = gt('phone-line');
    if (h) h.classList.toggle('lifted', phoneLifted);
    if (!phoneLifted) {
      if (st) st.textContent = '&mdash; \u7EBF\u8DEF\u7A7A\u95F2 &mdash;';
      if (ln) { ln.style.display = 'none'; ln.innerHTML = ''; }
      return;
    }
    if (st) {
      st.textContent = '\u00AB\u0411\u043B\u043E\u043A \u0447\u0435\u0442\u044B\u0440\u0435, \u0434\u0438\u0441\u043F\u0435\u0442\u0447\u0435\u0440. \u0414\u043E\u043B\u043E\u0436\u0438\u0442\u0435 \u043C\u043E\u0449\u043D\u043E\u0441\u0442\u044C.\u00BB \u00B7 \u300A\u56DB\u53F7\u673A\u7EC4\uFF0C\u8FD9\u91CC\u662F\u8C03\u5EA6\u3002\u62A5\u544A\u529F\u7387\u3002\u300B';
    }
    if (typeof Audio !== 'undefined' && Audio.playRelay) {
      try { Audio.playRelay(Audio.getBus('equipment'), 'light'); } catch (e) {}
    }
  }

  let teaState = 0; // 0 凉茶 · 1 热茶（3 口）· 2 已喝完
  let teaSips = 0;
  function openCoffee() {
    const cup = teaState === 2 ? '\u2615' : '\uD83E\uDD56';
    const steam = teaState === 1 ? '\u301C\u301C\u301C' : '\u00B7 \u00B7 \u00B7';
    const desc = teaState === 0
      ? '\u591C\u73ED\u7684\u8336\u5DF2\u7ECF\u51C9\u4E86\u3002\u5012\u4E00\u676F\u70ED\u7684\u5427\u3002'
      : teaState === 1
        ? teaSipDesc()
        : '\u5495\u55DC\u3002\u7CBE\u795E\u62C9\u6EE1\u3002\u8336\u53F6\u6CA1\u5149\u4E86\u2014\u2014\u660E\u5929\u518D\u6CE1\u3002';
    showProp(
      '<div class="coffee"><div class="coffee-steam" id="tea-steam">' + steam + '</div>'
      + '<div class="cup" id="tea-cup">' + cup + '</div>'
      + '<div class="tea-leaves" id="tea-leaves">' + leavesHtml() + '</div>'
      + '<p id="tea-desc">' + desc + '</p>'
      + '<div class="tea-actions" style="margin-top:12px;display:flex;gap:8px;justify-content:center;align-items:center;flex-wrap:wrap;">' + teaActionsHtml() + '</div>'
      + '<div class="clip-tools" style="margin-top:12px;"><button onclick="Props.closeProp()">\u2715 \u653E\u56DE</button></div></div>');
  }
  function leavesHtml() {
    if (teaState === 2) return '\uD83C\uDF43 \uD83C\uDF43 \uD83C\uDF43 \uD83C\uDF43 \uD83C\uDF43';
    if (teaSips >= 2) return '\uD83C\uDF43 \uD83C\uDF43 \uD83C\uDF43';
    return '\uD83C\uDF43 \uD83C\uDF43 \uD83C\uDF43 \uD83C\uDF43 \uD83C\uDF43 \uD83C\uDF43 \uD83C\uDF43';
  }
  function teaSipDesc() {
    if (teaSips === 0) return '\u70ED\u6C14\u817E\u817E\u3002\u8D76\u7D27\u559D\u4E00\u53E3\u3002';
    if (teaSips === 1) return '\u6E29\u5EA6\u6070\u5230\u597D\u5904\u3002\u8FD8\u5269 2 \u53E3\u3002';
    if (teaSips === 2) return '\u5FEB\u89C1\u5E95\u4E86\u3002\u6700\u540E 1 \u53E3\u3002';
    return '';
  }
  function teaActionsHtml() {
    return teaState === 0
      ? '<button class="tea-btn" onclick="Props.pourTea()">\uD83D\uDD25 \u5012\u4E00\u676F\u70ED\u8336</button>'
      : teaState === 1
        ? '<button class="tea-btn" onclick="Props.drinkTea()">\u2615 \u559D\u4E00\u53E3 (' + (3 - teaSips) + '/3)</button>'
        : '<button class="tea-btn" disabled>\u2615 \u5DF2\u559D\u5B8C</button>';
  }
  function pourTea() {
    if (teaState !== 0) return;
    teaState = 1;
    teaSips = 0;
    const steam = gt('tea-steam');
    const desc = gt('tea-desc');
    if (steam) steam.textContent = '\u301C\u301C\u301C';
    if (desc) desc.textContent = '\u70ED\u6C14\u817E\u817E\u3002\u8D76\u7D27\u559D\u4E00\u53E3\u3002';
    const act = document.querySelector('.tea-actions');
    if (act) act.innerHTML = teaActionsHtml();
    document.dispatchEvent(new CustomEvent('props:tea', { detail: { action: 'poured' } }));
    if (typeof Audio !== 'undefined' && Audio.pour) Audio.pour();
  }
  function drinkTea() {
    if (teaState !== 1) return;
    teaSips++;
    const cup = gt('tea-cup');
    const desc = gt('tea-desc');
    const leaves = gt('tea-leaves');
    if (teaSips >= 3) {
      teaState = 2;
      if (cup) cup.textContent = '\u2615';
      if (desc) desc.textContent = '\u5495\u55DC\u3002\u7CBE\u795E\u62C9\u6EE1\u3002\u8336\u53F6\u6CA1\u5149\u4E86\u2014\u2014\u660E\u5929\u518D\u6CE1\u3002';
      if (leaves) leaves.textContent = '\uD83C\uDF43 \uD83C\uDF43 \uD83C\uDF43 \uD83C\uDF43 \uD83C\uDF43';
      document.dispatchEvent(new CustomEvent('props:tea', { detail: { action: 'drunk' } }));
    } else {
      if (cup) cup.textContent = teaSips === 1 ? '\uD83E\uDD56\uFE0F' : '\uD83E\uDD56';
      if (desc) desc.textContent = teaSipDesc();
      if (leaves) leaves.textContent = leavesHtml();
      document.dispatchEvent(new CustomEvent('props:tea', { detail: { action: 'sip' } }));
    }
    const act = document.querySelector('.tea-actions');
    if (act) act.innerHTML = teaActionsHtml();
    if (typeof Audio !== 'undefined' && Audio.sip) Audio.sip();
  }
  function resetTea() {
    teaState = 0;
    teaSips = 0;
  }

  function showProp(html) {
    stage.innerHTML = html;
    overlay.classList.remove('hidden');
  }
  function closeProp() {
    overlay.classList.add('hidden');
    stage.innerHTML = '';
    if (openProp === 'dosimeter' && typeof Audio !== 'undefined' && Audio.getGeiger) {
      try { Audio.getGeiger().stop(); } catch (e) {}
    }
    openProp = null;
  }

  if (overlay) overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closeProp();
  });

  function highlight(id) {
    closeManual();
    const el = gt(id);
    if (!el) return;
    el.classList.remove('highlight-pulse');
    void el.offsetWidth;
    el.classList.add('highlight-pulse');
    setTimeout(function() { el.classList.remove('highlight-pulse'); }, 1600);
  }
  function highlightLamp(key) {
    closeManual();
    const el = document.querySelector('.lamp-unit[data-lamp="' + key + '"]');
    if (el) {
      el.classList.remove('highlight-pulse');
      void el.offsetWidth;
      el.classList.add('highlight-pulse');
      setTimeout(function() { el.classList.remove('highlight-pulse'); }, 1600);
    }
  }
  function toggleCheck(e) {
    if (e.target.tagName === 'LI') e.target.classList.toggle('done');
  }

  function init() {
    if (stage) stage.addEventListener('input', function(e) {
      if (openProp === 'clipboard' && (e.target.id === 'clip-name' || e.target.classList.contains('clip-line'))) {
        saveClip();
      }
    });
    document.querySelectorAll('.prop').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const p = btn.dataset.prop;
        openProp = p;
        switch (p) {
          case 'manual': openManual(); break;
          case 'clipboard': openClipboard(); break;
          case 'calculator': openCalculator(); break;
          case 'dosimeter': openDosimeter(); break;
          case 'phone': openPhone(); break;
          case 'phonebook': openPhonebook(); break;
          case 'coffee': openCoffee(); break;
          case 'about': /* handled in app.js */ break;
        }
      });
    });

    if (gt('manual-prev')) gt('manual-prev').addEventListener('click', function() {
      manualPage = Math.max(0, manualPage - 1); renderManual();
    });
    if (gt('manual-next')) gt('manual-next').addEventListener('click', function() {
      manualPage = Math.min(MANUAL.length - 1, manualPage + 1); renderManual();
    });
    if (gt('manual-close')) gt('manual-close').addEventListener('click', closeManual);
    if (!document._manualLangBound) {
      document._manualLangBound = true;
      document.querySelectorAll('.manual-lang button').forEach(function(b) {
        b.addEventListener('click', function() {
          document.querySelectorAll('.manual-lang button').forEach(function(x) { x.classList.remove('active'); });
          b.classList.add('active');
          manualLang = b.dataset.lang;
          renderManual();
        });
      });
    }
    if (gt('manual-overlay')) gt('manual-overlay').addEventListener('click', function(e) {
      if (e.target === gt('manual-overlay')) closeManual();
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') { closeProp(); closeManual(); }
    });
  }

  return {
    init, gotoPage: function(i) { manualPage = i; renderManual(); },
    highlight, highlightLamp, toggleCheck,
    closeProp, calcKey, setClipTool, exportClip,
    setDosiRange, togglePhone, updateDosimeter,
    phoneKey, phoneCall, phoneHang, phoneBook,
    pourTea, drinkTea, resetTea,
    isOpen: function() { return openProp; },
  };
})();
