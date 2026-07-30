const Props = (() => {

  const gt = id => document.getElementById(id);
  const overlay = gt('prop-overlay');
  const stage = gt('prop-stage');
  let openProp = null;

  const MANUAL = [
    {
      ru: '\u041E\u0411\u041B\u041E\u0416\u041A\u0410', cn: '\u5C01\u9762', tab: '\u5C01\u9762',
      body: () => '<div style="text-align:center;padding-top:40px;">'
        + '<div style="font-size:10px;letter-spacing:2px;color:#6e6a5c;">\u041C\u0418\u041D\u0418\u0421\u0422\u0415\u0420\u0421\u0422\u0412\u041E \u0421\u0420\u0415\u0414\u041D\u0415\u0413\u041E \u041C\u0410\u0428\u0418\u041D\u041E\u0421\u0422\u0420\u041E\u0415\u041D\u0418\u042F \u0421\u0421\u0421\u0420<br>\u82CF\u8054\u4E2D\u578B\u673A\u68B0\u5DE5\u4E1A\u90E8</div>'
        + '<div style="margin:24px auto;width:60%;border-top:2px solid #8a1f14;border-bottom:2px solid #8a1f14;padding:18px 0;">'
        + '<div class="m-title-ru" style="font-size:30px;">\u0420\u0411\u041C\u041A-1000</div>'
        + '<div style="font-size:15px;letter-spacing:4px;color:#4a463a;margin:6px 0;">\u0420\u0415\u0410\u041A\u0422\u041E\u0420\u041D\u0410\u042F \u0423\u0421\u0422\u0410\u041D\u041E\u0412\u041A\u0410</div>'
        + '<div style="font-size:13px;color:#6e6a5c;letter-spacing:6px;">\u53CD\u5E94\u5806\u88C5\u7F6E \u00B7 \u8FD0\u884C\u89C4\u7A0B</div>'
        + '<div style="font-size:10px;color:#8a8474;letter-spacing:2px;margin-top:4px;">\u042D\u041A\u0421\u041F\u041B\u0423\u0410\u0422\u0410\u0426\u0418\u041E\u041D\u041D\u042B\u0419 \u0420\u0415\u0413\u041B\u0410\u041C\u0415\u041D\u0422</div></div>'
        + '<div style="font-family:monospace;font-size:10px;color:#6e6a5c;line-height:2;">\u6587\u4EF6\u7F16\u53F7 \u0420\u0411\u041C\u041A-1000.00.00.000 \u0420\u042D<br>\u7248\u672C 1986 \u5E74\u4FEE\u8BA2\u7248 \u00B7 \u5BC6\u7EA7 \u0414\u0421\u041F</div>'
        + '<div style="margin-top:20px;">'
        + '<span class="m-stamp">\u0423\u0422\u0412\u0415\u0420\u0416\u0414\u0415\u041D\u041E<br>\u6279\u51C6 \u00B7 12.10.1983</span>'
        + '<span class="m-stamp" style="transform:rotate(6deg);margin-left:16px;">\u0418\u0417\u041C. \u211612<br>\u5DF2\u7EB3\u5165</span></div>'
        + '<div style="margin-top:26px;font-size:11px;letter-spacing:3px;color:#4a463a;">'
        + '\u0427\u0415\u0420\u041D\u041E\u0411\u042B\u041B\u042C\u0421\u041A\u0410\u042F \u0410\u042D\u0421 \u00B7 \u0411\u041B\u041E\u041A \u21164<br>'
        + '<span style="font-size:9px;color:#8a8474;">\u5207\u5C14\u8BFA\u8D1D\u5229\u6838\u7535\u7AD9 \u00B7 4\u53F7\u673A\u7EC4</span></div></div>'
    },
    {
      ru: '\u041E\u0413\u041B\u0410\u0412\u041B\u0415\u041D\u0418\u0415', cn: '\u76EE\u5F55', tab: '\u76EE\u5F55',
      body: () => {
        const toc = [[1,'\u53CD\u5E94\u5806\u88C5\u7F6E\u7B80\u8FF0','\u041A\u0420\u0410\u0422\u041A\u041E\u0415 \u041E\u041F\u0418\u0421\u0410\u041D\u0418\u0415 \u0420\u0423'],[2,'\u53CD\u5E94\u6027\u4E0E\u63A7\u5236\u68D2','\u0420\u0415\u0410\u041A\u0422\u0418\u0412\u041D\u041E\u0421\u0422\u042C \u0418 \u0421\u0422\u0415\u0420\u0416\u041D\u0418'],[3,'\u529F\u7387\u3001\u5468\u671F\u4E0E\u6C27\u4E2D\u6BD2','\u041C\u041E\u0429\u041D\u041E\u0421\u0422\u042C, \u041F\u0415\u0420\u0418\u041E\u0414, Xe'],[4,'\u7D27\u6025\u4FDD\u62A4\u7CFB\u7EDF','\u0410\u0412\u0410\u0420\u0418\u0419\u041D\u0410\u042F \u0417\u0410\u0429\u0418\u0422\u0410'],[5,'\u8FD0\u884C\u9650\u5236\u4E0E \u041E\u0417\u0420','\u041F\u0420\u0415\u0414\u0415\u041B\u042B \u0418 \u041E\u0417\u0420'],[6,'\u6B63\u5E38\u64CD\u4F5C\u7A0B\u5E8F','\u041D\u041E\u0420\u041C\u0410\u041B\u042C\u041D\u042B\u0415 \u041E\u041F\u0415\u0420\u0410\u0426\u0418\u0418'],[7,'\u5F02\u5E38\u5DE5\u51B5\u4E0E\u4E8B\u6545\u5904\u7406','\u0410\u0412\u0410\u0420\u0418\u0419\u041D\u042B\u0415 \u0420\u0415\u0416\u0418\u041C\u042B'],[8,'\u9644\u5F55 \u041A \u00B7 \u4FDD\u62A4\u5B9A\u503C\u8868','\u041F\u0420\u0418\u041B\u041E\u0416\u0415\u041D\u0418\u0415 \u0410'],[9,'\u9644\u5F55 \u0411 \u00B7 \u7F29\u7565\u8BED','\u041F\u0420\u0418\u041B\u041E\u0416\u0415\u041D\u0418\u0415 \u0411']];
        let html = '<div class="m-head"><span>\u0420\u0411\u041C\u041A-1000.00.00.000 \u0420\u042D</span><span>\u041E\u0413\u041B\u0410\u0412\u041B\u0415\u041D\u0418\u0415 \u00B7 \u76EE\u5F55</span></div>'
          + '<div class="m-title-ru">\u041E\u0413\u041B\u0410\u0412\u041B\u0415\u041D\u0418\u0415</div>'
          + '<div class="m-title-cn">\u76EE\u5F55</div>'
          + '<table class="m-table">';
        toc.forEach(function(t) {
          html += '<tr style="cursor:pointer;" onclick="Props.gotoPage(' + (t[0] + 1) + ')">'
            + '<td style="width:40px;font-family:monospace;">' + t[0] + '</td>'
            + '<td><b>' + t[1] + '</b><br><span style="font-size:10px;color:#8a8474;">' + t[2] + '</span></td>'
            + '<td style="width:60px;text-align:right;font-family:monospace;">' + (t[0] + 2) + '</td></tr>';
        });
        html += '</table><div class="m-warn">\u63D0\u793A: \u5E26 <span class="m-term">\u4E0B\u5212\u7EBF</span> \u7684\u6761\u76EE\u53EF\u70B9\u51FB, \u8054\u52A8\u63A7\u5236\u9762\u677F\u4E0A\u7684\u5BF9\u5E94\u4EEA\u8868\u3002</div>';
        return html;
      }
    },
    {
      ru: '\u0413\u041B.1 \u041E\u041F\u0418\u0421\u0410\u041D\u0418\u0415', cn: '\u7B2C1\u7AE0 \u88C5\u7F6E\u7B80\u8FF0', tab: '1 \u7B80\u8FF0',
      body: () => '<div class="m-head"><span>\u0413\u041B\u0410\u0412\u0410 1</span><span>\u0441\u0442\u0440. 3</span></div>'
        + '<div class="m-title-ru">\u041A\u0420\u0410\u0422\u041A\u041E\u0415 \u041E\u041F\u0418\u0421\u0410\u041D\u0418\u0415 \u0420\u0423</div>'
        + '<div class="m-title-cn">\u7B2C 1 \u7AE0 \u00B7 \u53CD\u5E94\u5806\u88C5\u7F6E\u7B80\u8FF0</div>'
        + '<div class="m-h2">1.1 \u603B\u4F53\u7279\u5F81</div>'
        + '<p class="m-p"><span class="m-term">\u0420\u0411\u041C\u041A-1000</span> (\u5927\u529F\u7387\u538B\u529B\u7BA1\u5F0F\u53CD\u5E94\u5806) \u662F\u77F3\u58A8\u6162\u5316\u3001\u8F7B\u6C34\u51B7\u5374\u7684\u6CB8\u6C34\u5806:</p>'
        + '<p class="m-p">\u00B7 \u77F3\u58A8\u7814\u4F53\u4F5C\u4E3A\u6162\u5316\u5242, \u5806\u82AF \u00D811.8 \u00D7 7 \u043C<br>'
        + '\u00B7 1661 \u6839\u5DE5\u827A\u7BA1 (\u0422\u041A), \u5185\u88C5\u71C3\u6599\u7EC4\u4EF6<br>'
        + '\u00B7 \u51B7\u5374\u5242\u5728\u7BA1\u5185\u6CB8\u817E, \u84B8\u6C7D\u76F4\u63A5\u9001\u6C7D\u8F6E\u673A<br>'
        + '\u00B7 \u65E0\u6574\u4F53\u538B\u529B\u5BB9\u5668, \u5355\u7BA1\u7834\u635F\u4E0D\u5BFC\u81F4\u5168\u5806\u5931\u6C34</p>'
        + '<div class="m-h2">1.2 \u4E3B\u8981\u53C2\u6570</div>'
        + '<table class="m-table"><tr><th>\u53C2\u6570</th><th>\u6570\u503C</th></tr>'
        + '<tr><td>\u989D\u5B9A\u70ED\u529F\u7387</td><td><span class="m-link" onclick="Props.highlight(\'dial-power\')">3200 \u041C\u0412\u0442</span></td></tr>'
        + '<tr><td>\u7535\u529F\u7387</td><td>1000 \u041C\u0412\u0442</td></tr>'
        + '<tr><td>\u5DE5\u827A\u7BA1 / \u63A7\u5236\u68D2</td><td>1661 / <b>211 \u6839</b></td></tr>'
        + '<tr><td>\u5206\u79BB\u5668\u538B\u529B</td><td>6.9 \u041C\u041F\u0430</td></tr>'
        + '<tr><td>\u4E3B\u5FAA\u73AF\u6CF5 \u0413\u0426\u041D</td><td>8 \u53F0</td></tr></table>'
        + '<div class="m-h2">1.3 \u529F\u7387\u5206\u5E03</div>'
        + '<p class="m-p">\u8F74\u5411\u529F\u7387\u5206\u5E03\u8FD1\u4F3C\u6B63\u5F26, \u5806\u82AF\u4E2D\u90E8\u529F\u7387\u5BC6\u5EA6\u6700\u9AD8\u3002'
        + '<span class="m-link" onclick="Props.highlight(\'core-canvas\')">\u67E5\u770B\u5806\u82AF\u5256\u9762 \u2192</span></p>'
    },
    {
      ru: '\u0413\u041B.2 \u0420\u0415\u0410\u041A\u0422\u0418\u0412\u041D\u041E\u0421\u0422\u042C', cn: '\u7B2C2\u7AE0 \u53CD\u5E94\u6027\u4E0E\u63A7\u5236\u68D2', tab: '2 \u53CD\u5E94\u6027',
      body: () => '<div class="m-head"><span>\u0413\u041B\u0410\u0412\u0410 2</span><span>\u0441\u0442\u0440. 5</span></div>'
        + '<div class="m-title-ru">\u0420\u0415\u0410\u041A\u0422\u0418\u0412\u041D\u041E\u0421\u0422\u042C \u0418 \u0421\u0422\u0415\u0420\u0416\u041D\u0418</div>'
        + '<div class="m-title-cn">\u7B2C 2 \u7AE0 \u00B7 \u53CD\u5E94\u6027\u4E0E\u63A7\u5236\u68D2</div>'
        + '<div class="m-h2">2.1 \u63A7\u5236\u68D2\u7ED3\u6784</div>'
        + '<p class="m-p">\u6BCF\u6839\u63A7\u5236\u68D2\u81EA\u4E0A\u800C\u4E0B\u7531\u4E09\u90E8\u5206\u7EC4\u6210:</p>'
        + '<pre style="font-family:monospace;font-size:11px;background:#e8e0c8;padding:10px;border-radius:3px;line-height:1.6;">\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510\n\u2502  B\u2084C  \u2502 \u2190 \u78B3\u5316\u7877\u5438\u6536\u4F53\n\u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524\n\u2502  \u77F3\u58A8  \u2502 \u2190 \u77F3\u58A8\u7F6E\u6362\u4F53 (~4.5 \u043C)\n\u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524\n\u2502  \u6C34   \u2502 \u2190 \u6C34\u67F1 (~1.25 \u043C)\n\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518</pre>'
        + '<p class="m-p">\u68D2\u9A71\u52A8\u901F\u5EA6: <b>0.4 \u043C/\u0441</b>, \u5168\u884C\u7A0B\u7EA6 18 \u79D2\u3002</p>'
        + '<div class="m-h2">2.2 \u7AEF\u90E8\u6548\u5E94 (\u7F6E\u6362\u4F53\u6548\u5E94)</div>'
        + '<p class="m-p">\u5F53\u63A7\u5236\u68D2\u4ECE\u5806\u82AF\u4E0B\u90E8\u63D0\u51FA\u65F6, \u77F3\u58A8\u7F6E\u6362\u4F53\u8FDB\u5165\u539F\u672C\u5145\u6EE1\u6C34\u7684\u901A\u9053\u533A\u57DF\u3002\u77F3\u58A8\u7684\u4E2D\u5B50\u5438\u6536\u8FDC\u5C0F\u4E8E\u6C34, \u56E0\u6B64\u63D0\u68D2\u521D\u671F\u53EF\u80FD\u5728\u5806\u82AF\u4E0B\u90E8\u5F15\u5165\u6B63\u53CD\u5E94\u6027\u3002</p>'
        + '<div class="m-warn">\u26A0 \u5728\u4F4E\u529F\u7387\u3001\u4F4E \u041E\u0417\u0420 \u5DE5\u51B5\u4E0B, \u6B64\u6548\u5E94\u663E\u8457\u3002\u4FEE\u6539\u901A\u77E5 \u211612 \u5BF9\u672C\u6BB5\u6709\u4FEE\u8BA2 \u2014 \u89C1\u9644\u5F55\u3002</div>'
        + '<div class="m-h2">2.3 \u53CD\u5E94\u6027\u5E73\u8861</div>'
        + '<p class="m-p">\u4E34\u754C\u65F6\u603B\u53CD\u5E94\u6027 \u03C1 = 0\u3002\u5404\u5206\u91CF\u5B9E\u65F6\u663E\u793A\u4E8E<span class="m-link" onclick="Props.highlight(\'rho-canvas\')">\u53CD\u5E94\u6027\u5E73\u8861\u9762\u677F \u2192</span></p>'
    },
    {
      ru: '\u0413\u041B.3 \u041C\u041E\u0429\u041D\u041E\u0421\u0422\u042C', cn: '\u7B2C3\u7AE0 \u529F\u7387\u4E0E\u6C27', tab: '3 \u529F\u7387',
      body: () => '<div class="m-head"><span>\u0413\u041B\u0410\u0412\u0410 3</span><span>\u0441\u0442\u0440. 7</span></div>'
        + '<div class="m-title-ru">\u041C\u041E\u0429\u041D\u041E\u0421\u0422\u042C, \u041F\u0415\u0420\u0418\u041E\u0414, \u041A\u0421\u0415\u041D\u041E\u041D</div>'
        + '<div class="m-title-cn">\u7B2C 3 \u7AE0 \u00B7 \u529F\u7387\u3001\u5468\u671F\u4E0E\u6C27\u4E2D\u6BD2</div>'
        + '<div class="m-h2">3.1 \u529F\u7387\u4E0E\u5468\u671F</div>'
        + '<p class="m-p">\u70ED\u529F\u7387 N(t) \u4EE5\u989D\u5B9A 3200 \u041C\u0412\u0442 \u7684\u767E\u5206\u6BD4\u8868\u793A\u3002\u5468\u671F T \u5B9A\u4E49\u4E3A\u529F\u7387\u53D8\u5316 e \u500D\u6240\u9700\u65F6\u95F4\u3002T &gt; 0 \u4E0A\u5347, T &lt; 0 \u4E0B\u964D, |T| \u8D8A\u5C0F\u53D8\u5316\u8D8A\u5FEB\u3002</p>'
        + '<div class="m-warn">\u4FDD\u62A4\u5B9A\u503C <span class="m-link" onclick="Props.highlightLamp(\'P2\')">\u041F2: \u5468\u671F &lt; 10 \u79D2</span> \u65F6\u89E6\u53D1\u7D27\u6025\u505C\u5806\u3002</div>'
        + '<div class="m-h2">3.2 \u6C27-135 \u4E2D\u6BD2</div>'
        + '<p class="m-p">Xe-135 \u662F\u88C2\u53D8\u4EA7\u7269, \u4E2D\u5B50\u5438\u6536\u622A\u9762\u6781\u5927:</p>'
        + '<p class="m-p">\u00B7 \u4EA7\u751F: \u88C2\u53D8\u76F4\u63A5\u4EA7\u751F + I-135 \u8870\u53D8 (\u534A\u8870\u671F 6.6 \u0447)<br>'
        + '\u00B7 \u6D88\u5931: \u4E2D\u5B50\u71C3\u8017 + \u81EA\u8EAB\u8870\u53D8 (\u534A\u8870\u671F 9.2 \u0447)</p>'
        + '<div class="m-h2">3.3 \u7898\u5751</div>'
        + '<p class="m-p">\u964D\u529F\u7387\u540E\u4E2D\u5B50\u901A\u91CF\u4E0B\u964D, Xe \u71C3\u8017\u51CF\u5C11, \u4F46 I-135 \u7EE7\u7EED\u8870\u53D8\u4EA7\u751F Xe \u2192 \u6D53\u5EA6\u4E0A\u5347 \u2192 \u53CD\u5E94\u6027\u4E0B\u964D \u2192 \u9700\u63D0\u68D2\u8865\u507F\u3002\u5CF0\u503C\u51FA\u73B0\u5728\u964D\u529F\u7387\u540E 6\u201310 \u5C0F\u65F6\u3002</p>'
        + '<div class="m-warn">\u26A0 \u5728\u7898\u5751\u4E2D\u5F3A\u884C\u63D0\u68D2\u7EF4\u6301\u529F\u7387\u4F1A\u6D88\u8017 \u041E\u0417\u0420\u3002\u5F53 \u041E\u0417\u0420 \u4E0D\u8DB3\u65F6, \u5806\u82AF\u5931\u53BB\u53EF\u63A7\u6027\u88D5\u5EA6\u3002'
        + '<span class="m-link" onclick="Props.highlight(\'chart-canvas\')">\u67E5\u770B Xe \u8D8B\u52BF\u66F2\u7EBF \u2192</span></div>'
    },
    {
      ru: '\u0413\u041B.4 \u0410\u0417', cn: '\u7B2C4\u7AE0 \u7D27\u6025\u4FDD\u62A4', tab: '4 \u4FDD\u62A4',
      body: () => '<div class="m-head"><span>\u0413\u041B\u0410\u0412\u0410 4</span><span>\u0441\u0442\u0440. 9</span></div>'
        + '<div class="m-title-ru">\u0410\u0412\u0410\u0420\u0418\u0419\u041D\u0410\u042F \u0417\u0410\u0429\u0418\u0422\u0410</div>'
        + '<div class="m-title-cn">\u7B2C 4 \u7AE0 \u00B7 \u7D27\u6025\u4FDD\u62A4\u7CFB\u7EDF</div>'
        + '<div class="m-h2">4.1 \u4FDD\u62A4\u901A\u9053</div>'
        + '<table class="m-table"><tr><th>\u901A\u9053</th><th>\u53C2\u6570</th><th>\u5B9A\u503C</th></tr>'
        + '<tr onclick="Props.highlightLamp(\'P1\')" style="cursor:pointer;"><td><b>\u041F1</b></td><td>\u4E2D\u5B50\u529F\u7387</td><td>&gt; 110 % N\u043D\u043E\u043C</td></tr>'
        + '<tr onclick="Props.highlightLamp(\'P2\')" style="cursor:pointer;"><td><b>\u041F2</b></td><td>\u5468\u671F</td><td>&lt; 10 \u0441</td></tr>'
        + '<tr onclick="Props.highlightLamp(\'P3\')" style="cursor:pointer;"><td><b>\u041F3</b></td><td>\u5206\u79BB\u5668\u538B\u529B</td><td>&gt; 7.25 \u041C\u041F\u0430</td></tr>'
        + '<tr onclick="Props.highlightLamp(\'P4\')" style="cursor:pointer;"><td><b>\u041F4</b></td><td>\u5206\u79BB\u5668\u6C34\u4F4D</td><td>\u8D85\u51FA\u89C4\u5B9A\u503C</td></tr>'
        + '<tr onclick="Props.highlightLamp(\'P5\')" style="cursor:pointer;"><td><b>\u041F5</b></td><td>\u5DE5\u827A\u7BA1\u7834\u635F</td><td>\u653E\u5C04\u6027\u5347\u9AD8</td></tr></table>'
        + '<p class="m-p">\u8D85\u9650\u65F6\u81EA\u52A8\u89E6\u53D1 <span class="m-term">\u0410\u0417-5</span>: \u5168\u90E8 211 \u6839\u63A7\u5236\u68D2\u4EE5\u5DE5\u4F5C\u901F\u5EA6\u4E0B\u63D2, \u7EA6 18 \u79D2\u5230\u4F4D\u3002'
        + '<span class="m-link" onclick="Props.highlight(\'btn-az5\')">\u5B9A\u4F4D \u0410\u0417-5 \u6309\u94AE \u2192</span></p>'
        + '<div class="m-h2">4.2 \u5173\u4E8E\u505C\u5806\u53CD\u5E94\u6027</div>'
        + '<p class="m-p">\u0410\u0417-5 \u89E6\u53D1\u540E, \u82E5\u5927\u91CF\u68D2\u5904\u4E8E\u9AD8\u4F4D, \u4E0B\u63D2\u521D\u671F\u77F3\u58A8\u7F6E\u6362\u4F53\u8FDB\u5165\u5806\u82AF, \u53EF\u80FD\u5F15\u5165\u6B63\u53CD\u5E94\u6027\u3002</p>'
        + '<p class="m-redact" title="\u4FEE\u6539\u901A\u77E5 \u211612 \u5DF2\u5C06\u672C\u6BB5\u8868\u8FF0\u66FF\u6362\u3002\u539F\u5185\u5BB9\u6D89\u53CA\u6B63\u505C\u5806\u6548\u5E94\u5B9A\u91CF\u8BC4\u4F30, \u6309\u4E0A\u7EA7\u6307\u793A\u5220\u9664\u3002">\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588</p>'
        + '<p class="m-redact" title="\u8BE5\u6BB5\u5728 1986 \u5E74\u7248\u672C\u4E2D\u4E0D\u53EF\u8BFB">\u2588\u2588\u2588\u2588 \u6309\u4E0A\u7EA7\u6307\u793A \u2588\u2588\u2588\u2588 \u4E0D\u4E88\u516C\u5E03 \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588</p>'
        + '<p class="m-p" style="margin-top:10px;">\u64CD\u4F5C\u5458\u5E94\u786E\u4FDD \u041E\u0417\u0420 \u4E0D\u4F4E\u4E8E\u89C4\u5B9A\u503C, \u4EE5\u4FDD\u8BC1\u505C\u5806\u5DE5\u51B5\u4E0B\u7684\u53CD\u5E94\u6027\u5B89\u5168\u3002</p>'
    },
    {
      ru: '\u0413\u041B.5 \u041E\u0417\u0420', cn: '\u7B2C5\u7AE0 \u8FD0\u884C\u9650\u5236', tab: '5 \u041E\u0417\u0420',
      body: () => '<div class="m-head"><span>\u0413\u041B\u0410\u0412\u0410 5</span><span>\u0441\u0442\u0440. 11</span></div>'
        + '<div class="m-title-ru">\u041F\u0420\u0415\u0414\u0415\u041B\u042B \u0418 \u041E\u0417\u0420</div>'
        + '<div class="m-title-cn">\u7B2C 5 \u7AE0 \u00B7 \u8FD0\u884C\u9650\u5236\u4E0E \u041E\u0417\u0420</div>'
        + '<div class="m-h2">5.1 \u041E\u0417\u0420 \u5B9A\u4E49</div>'
        + '<p class="m-p"><span class="m-term">\u041E\u0417\u0420</span> (\u041E\u043F\u0435\u0440\u0430\u0442\u0438\u0432\u043D\u044B\u0439 \u0417\u0430\u043F\u0430\u0441 \u0420\u0435\u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442\u0438, \u64CD\u4F5C\u53CD\u5E94\u6027\u88D5\u5EA6): \u5C06\u5168\u90E8\u63A7\u5236\u68D2\u4E0B\u63D2\u81F3\u6700\u4F4E\u4F4D\u7F6E\u540E, \u5269\u4F59\u7684\u6B63\u53CD\u5E94\u6027, \u4EE5\u7B49\u6548\u68D2\u6570\u8868\u793A\u3002\u5B83\u53CD\u6620\u201C\u505C\u5806\u540E\u8FD8\u80FD\u4E0D\u80FD\u91CD\u65B0\u53EF\u63A7\u542F\u52A8\u201D\u3002</p>'
        + '<div class="m-h2">5.2 \u9650\u503C</div>'
        + '<table class="m-table"><tr><th>\u72B6\u6001</th><th>\u8981\u6C42</th></tr>'
        + '<tr><td>\u041E\u0417\u0420 \u2265 <span class="m-link" onclick="Props.highlight(\'read-opr\')">15 \u6839</span></td><td>\u5141\u8BB8\u8FD0\u884C</td></tr>'
        + '<tr><td>\u041E\u0417\u0420 &lt; 15</td><td>\u5FC5\u987B\u964D\u529F\u7387\u6216\u505C\u5806</td></tr>'
        + '<tr><td>\u041E\u0417\u0420 &lt; <b>8</b></td><td><b style="color:#8a1f14;">\u7ACB\u5373\u505C\u5806</b></td></tr></table>'
        + '<div class="m-h2">5.3 \u5F71\u54CD\u56E0\u7D20</div>'
        + '<p class="m-p">\u00B7 \u6C27\u4E2D\u6BD2: Xe \u79EF\u7D2F\u6D88\u8017\u6B63\u53CD\u5E94\u6027 \u2192 \u041E\u0417\u0420 \u4E0B\u964D<br>'
        + '\u00B7 \u63D0\u68D2\u8865\u507F: \u68D2\u4F4D\u5347\u9AD8 \u2192 \u041E\u0417\u0420 \u4E0B\u964D<br>'
        + '\u00B7 \u7A7A\u6CE1: \u529F\u7387\u5347\u9AD8 \u2192 \u9700\u63D0\u68D2 \u2192 \u041E\u0417\u0420 \u4E0B\u964D</p>'
        + '<div class="m-warn">\u26A0 <b>\u4F4E\u529F\u7387 + \u9AD8\u6C27 + \u9AD8\u68D2\u4F4D = \u041E\u0417\u0420 \u6700\u5C0F\u5316\u3002</b>\u8FD9\u662F\u6700\u5371\u9669\u7684\u8FD0\u884C\u5DE5\u51B5\u7EC4\u5408\u3002</div>'
    },
    {
      ru: '\u0413\u041B.6 \u041E\u041F\u0415\u0420\u0410\u0426\u0418\u0418', cn: '\u7B2C6\u7AE0 \u64CD\u4F5C\u7A0B\u5E8F', tab: '6 \u64CD\u4F5C',
      body: () => '<div class="m-head"><span>\u0413\u041B\u0410\u0412\u0410 6</span><span>\u0441\u0442\u0440. 12</span></div>'
        + '<div class="m-title-ru">\u041D\u041E\u0420\u041C\u0410\u041B\u042C\u041D\u042B\u0415 \u041E\u041F\u0415\u0420\u0410\u0426\u0418\u0418</div>'
        + '<div class="m-title-cn">\u7B2C 6 \u7AE0 \u00B7 \u6B63\u5E38\u64CD\u4F5C\u7A0B\u5E8F</div>'
        + '<div class="m-h2">6.1 \u542F\u52A8\u5E8F\u5217</div>'
        + '<ul class="m-checklist" onclick="Props.toggleCheck(event)">'
        + '<li>\u786E\u8BA4 \u041E\u0417\u0420 \u2265 15 \u6839</li>'
        + '<li>\u786E\u8BA4\u4FDD\u62A4\u7CFB\u7EDF\u5168\u90E8\u6295\u5165 (\u94A5\u5319\u5728\u95ED\u5408\u4F4D)</li>'
        + '<li>\u4E3B\u5FAA\u73AF\u6CF5\u8FD0\u884C \u2265 6 \u53F0</li>'
        + '<li>\u4EE5\u68D2\u901F 0.4 %/\u0441 \u7F13\u6162\u63D0\u68D2</li>'
        + '<li>\u76D1\u89C6\u5468\u671F, \u786E\u8BA4 T &gt; 60 \u0441</li>'
        + '<li>\u529F\u7387\u5347\u81F3 10% \u540E\u7A33\u5B9A, \u68C0\u67E5\u53C2\u6570</li>'
        + '<li>\u9010\u6B65\u5347\u529F\u7387, \u6BCF\u6B65\u7A33\u5B9A \u2265 30 \u5206\u949F</li>'
        + '<li>\u8FBE\u5230\u989D\u5B9A\u529F\u7387, \u8BB0\u5F55\u65E5\u5FD7</li></ul>'
        + '<div class="m-h2">6.2 \u964D\u529F\u7387</div>'
        + '<ul class="m-checklist" onclick="Props.toggleCheck(event)">'
        + '<li>\u4EE5 \u2264 1 %/\u043C\u0438\u043D \u901F\u7387\u964D\u68D2</li>'
        + '<li>\u76D1\u89C6\u6C27\u79EF\u7D2F\u8D8B\u52BF</li>'
        + '<li>\u529F\u7387 &lt; 50% \u65F6\u6CE8\u610F\u7898\u5751</li>'
        + '<li>\u8BB0\u5F55\u964D\u529F\u7387\u539F\u56E0\u4E0E\u65F6\u95F4</li></ul>'
        + '<div class="m-h2">6.3 \u4E3B\u6CF5\u64CD\u4F5C</div>'
        + '<p class="m-p">\u6B63\u5E38\u8FD0\u884C 6 \u53F0 \u0413\u0426\u041D\u3002\u589E\u52A0\u6CF5\u6570 \u2192 \u6D41\u91CF\u4E0A\u5347 \u2192 \u7A7A\u6CE1\u51CF\u5C11 \u2192 \u5F15\u5165\u6B63\u53CD\u5E94\u6027\u3002<b>\u8BD5\u9A8C\u5DE5\u51B5\u4E0B\u589E\u6CF5\u9700\u8C28\u614E\u8BC4\u4F30\u3002</b></p>'
    },
    {
      ru: '\u0413\u041B.7 \u0410\u0412\u0410\u0420\u0418\u0418', cn: '\u7B2C7\u7AE0 \u4E8B\u6545\u5904\u7406', tab: '7 \u4E8B\u6545',
      body: () => '<div class="m-head"><span>\u0413\u041B\u0410\u0412\u0410 7</span><span>\u0441\u0442\u0440. 14</span></div>'
        + '<div class="m-title-ru">\u0410\u0412\u0410\u0420\u0418\u0419\u041D\u042B\u0415 \u0420\u0415\u0416\u0418\u041C\u042B</div>'
        + '<div class="m-title-cn">\u7B2C 7 \u7AE0 \u00B7 \u5F02\u5E38\u5DE5\u51B5\u4E0E\u4E8B\u6545\u5904\u7406</div>'
        + '<div class="m-h2">7.1 \u6C27\u632F\u8361</div>'
        + '<p class="m-p">\u73B0\u8C61: \u529F\u7387\u5206\u5E03\u8F74\u5411\u504F\u79FB, \u5C40\u90E8\u529F\u7387\u5347\u9AD8\u3002<br>'
        + '\u5904\u7F6E: \u505C\u6B62\u63D0\u68D2, \u5FC5\u8981\u65F6\u964D\u529F\u7387; \u7B49\u5F85 \u6C27\u71C3\u8017\u6062\u590D; <b>\u7981\u6B62\u5728 \u041E\u0417\u0420 \u4E0D\u8DB3\u65F6\u5F3A\u884C\u63D0\u68D2\u3002</b></p>'
        + '<div class="m-h2">7.2 \u5931\u6D41\u4E8B\u6545 (\u0413\u0426\u041D \u8DF3\u95F8)</div>'
        + '<p class="m-p">\u73B0\u8C61: \u6D41\u91CF\u9AA4\u964D, \u7A7A\u6CE1\u589E\u52A0, \u529F\u7387\u53EF\u80FD\u4E0A\u5347\u3002<br>'
        + '\u5904\u7F6E: \u786E\u8BA4\u5907\u7528\u6CF5\u81EA\u542F\u52A8; \u529F\u7387 &gt; 110% \u786E\u8BA4 \u041F1 \u52A8\u4F5C; \u5FC5\u8981\u65F6\u624B\u52A8 \u0410\u0417-5\u3002</p>'
        + '<div class="m-h2">7.3 \u7D27\u6025\u505C\u5806\u540E</div>'
        + '<ul class="m-checklist" onclick="Props.toggleCheck(event)">'
        + '<li>\u786E\u8BA4\u5168\u90E8\u68D2\u4E0B\u63D2\u5230\u4F4D</li>'
        + '<li>\u76D1\u89C6\u529F\u7387\u4E0B\u964D\u4E0E\u8870\u53D8\u70ED</li>'
        + '<li>\u4FDD\u6301\u51B7\u5374\u5242\u5FAA\u73AF</li>'
        + '<li>\u8BB0\u5F55\u505C\u5806\u539F\u56E0\u3001\u65F6\u95F4\u3001\u68D2\u4F4D</li>'
        + '<li>\u5411\u503C\u957F\u4E0E\u4E0A\u7EA7\u62A5\u544A</li></ul>'
        + '<div class="m-warn">\u26A0 \u82E5\u505C\u5806\u540E\u529F\u7387\u4E0D\u964D\u53CD\u5347: \u7ACB\u5373\u786E\u8BA4 \u041E\u0417\u0420 \u72B6\u6001, \u8003\u8651\u4E8B\u6545\u6392\u70ED\u7A0B\u5E8F\u3002</div>'
    },
    {
      ru: '\u041F\u0420\u0418\u041B. \u0410', cn: '\u9644\u5F55\u041A \u5B9A\u503C\u8868', tab: '\u0410 \u5B9A\u503C',
      body: () => '<div class="m-head"><span>\u041F\u0420\u0418\u041B\u041E\u0416\u0415\u041D\u0418\u0415 \u0410</span><span>\u0441\u0442\u0440. 15</span></div>'
        + '<div class="m-title-ru">\u0423\u0421\u0422\u0410\u0412\u041A\u0418 \u0417\u0410\u0429\u0418\u0422\u042B</div>'
        + '<div class="m-title-cn">\u9644\u5F55 \u0410 \u00B7 \u4FDD\u62A4\u5B9A\u503C\u6C47\u603B\u8868</div>'
        + '<table class="m-table"><tr><th>\u901A\u9053</th><th>\u53C2\u6570</th><th>\u5B9A\u503C</th><th>\u52A8\u4F5C</th></tr>'
        + '<tr><td>\u041F1</td><td>\u4E2D\u5B50\u529F\u7387</td><td>&gt; 110 %</td><td>\u0410\u0417-5</td></tr>'
        + '<tr><td>\u041F2</td><td>\u5468\u671F</td><td>&lt; 10 \u0441</td><td>\u0410\u0417-5</td></tr>'
        + '<tr><td>\u041F3</td><td>\u5206\u79BB\u5668\u538B\u529B</td><td>&gt; 7.25 \u041C\u041F\u0430</td><td>\u0410\u0417-5</td></tr>'
        + '<tr><td>\u041F4</td><td>\u5206\u79BB\u5668\u6C34\u4F4D</td><td>\u8D85\u9650</td><td>\u0410\u0417-5</td></tr>'
        + '<tr><td>\u041F5</td><td>\u5DE5\u827A\u7BA1\u7834\u635F</td><td>\u653E\u5C04\u6027 \u2191</td><td>\u0410\u0417-5</td></tr>'
        + '<tr style="background:rgba(232,164,24,0.12);"><td>\u041E\u0417\u0420</td><td>\u64CD\u4F5C\u88D5\u5EA6</td><td>&lt; 15 \u6839</td><td>\u964D\u529F\u7387/\u505C\u5806</td></tr>'
        + '<tr style="background:rgba(194,36,16,0.1);"><td>\u041E\u0417\u0420</td><td>\u64CD\u4F5C\u88D5\u5EA6</td><td>&lt; 8 \u6839</td><td><b>\u7ACB\u5373\u505C\u5806</b></td></tr></table>'
        + '<div class="m-p" style="margin-top:16px;font-size:11px;color:#8a8474;">\u672C\u8868\u4E0E\u7B2C 4 \u7AE0\u4E00\u81F4\u3002\u5982\u6709\u51B2\u7A81, \u4EE5\u4FEE\u6539\u901A\u77E5 \u211612 \u4E3A\u51C6\u3002</div>'
    },
    {
      ru: '\u041F\u0420\u0418\u041B. \u0411', cn: '\u9644\u5F55\u0411 / \u4FEE\u6539\u901A\u77E5', tab: '\u0411 \u9644\u5F55',
      body: () => '<div class="m-head"><span>\u041F\u0420\u0418\u041B\u041E\u0416\u0415\u041D\u0418\u0415 \u0411</span><span>\u0441\u0442\u0440. 16</span></div>'
        + '<div class="m-title-ru">\u0421\u041E\u041A\u0420\u0410\u0429\u0415\u041D\u0418\u042F \u00B7 \u0418\u0417\u041C. \u211612</div>'
        + '<div class="m-title-cn">\u9644\u5F55 \u0411 \u00B7 \u7F29\u7565\u8BED / \u4FEE\u6539\u901A\u77E5</div>'
        + '<table class="m-table"><tr><td>\u0410\u0417</td><td>\u0410\u0432\u0430\u0440\u0438\u0439\u043D\u0430\u044F \u0417\u0430\u0449\u0438\u0442\u0430</td><td>\u7D27\u6025\u4FDD\u62A4</td></tr>'
        + '<tr><td>\u0413\u0426\u041D</td><td>\u0413\u043B. \u0426\u0438\u0440\u043A\u0443\u043B\u044F\u0446. \u041D\u0430\u0441\u043E\u0441</td><td>\u4E3B\u5FAA\u73AF\u6CF5</td></tr>'
        + '<tr><td>\u041E\u0417\u0420</td><td>\u041E\u043F\u0435\u0440\u0430\u0442. \u0417\u0430\u043F\u0430\u0441 \u0420\u0435\u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442\u0438</td><td>\u64CD\u4F5C\u53CD\u5E94\u6027\u88D5\u5EA6</td></tr>'
        + '<tr><td>\u0422\u041A</td><td>\u0422\u0435\u0445\u043D\u043E\u043B\u043E\u0433\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u041A\u0430\u043D\u0430\u043B</td><td>\u5DE5\u827A\u7BA1</td></tr>'
        + '<tr><td>\u0414\u0421\u041F</td><td>\u0414\u043B\u044F \u0421\u043B\u0443\u0436\u0435\u0431\u043D\u043E\u0433\u043E \u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043D\u0438\u044F</td><td>\u4F9B\u516C\u52A1\u4F7F\u7528</td></tr></table>'
        + '<div style="border:2px solid #8a8474;padding:12px;margin:14px 0;background:#e8e0c8;">'
        + '<div style="font-size:11px;font-weight:700;letter-spacing:1px;">\u0418\u0417\u0412\u0415\u0429\u0415\u041D\u0418\u0415 \u041E\u0411 \u0418\u0417\u041C\u0415\u041D\u0415\u041D\u0418\u0418 \u2116 12 \u00B7 \u4FEE\u6539\u901A\u77E5</div>'
        + '<div style="font-family:monospace;font-size:9px;color:#8a8474;">15.03.1984 \u00B7 \u7B2C 4 \u7AE0 4.3 \u8282</div>'
        + '<p class="m-redact" style="display:block;margin-top:8px;" title="\u6309\u4E0A\u7EA7\u6307\u793A, \u672C\u6BB5\u5B9A\u91CF\u8BC4\u4F30\u4E0D\u4E88\u516C\u5E03">\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588</p>'
        + '<p class="m-redact" style="display:block;" title="\u6B63\u505C\u5806\u6548\u5E94\u2026">\u2588\u2588\u2588\u2588 \u6B63\u505C\u5806\u6548\u5E94 \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588</p>'
        + '<p style="font-size:11px;margin-top:8px;">\u64CD\u4F5C\u5458\u5E94\u4E25\u683C\u9075\u5B88 \u041E\u0417\u0420 \u9650\u503C\u89C4\u5B9A\u3002</p></div>'
        + '<div style="border-top:1px dashed #b8b2a0;padding-top:12px;">'
        + '<div style="font-family:var(--f-hand);font-size:17px;color:#3a4a6a;line-height:1.6;">'
        + '&ldquo;01:03 \u2014 \u503C\u957F\u8BF4\u7EE7\u7EED\u3002OPR \u53EA\u5269 8 \u6839\u3002<br>'
        + '\u6211\u63D0\u4E86\u53CD\u5BF9, \u8BB0\u5F55\u5728\u65E5\u5FD7\u91CC\u3002&rdquo;<br><br>'
        + '&ldquo;\u89C4\u7A0B 4.3 \u88AB\u6D82\u6389\u4E86\u3002\u6CA1\u4EBA\u544A\u8BC9\u6211\u4EEC AZ-5<br>'
        + '\u4F1A\u5148\u5347\u529F\u7387\u3002\u8BBE\u8BA1\u6587\u4EF6\u91CC\u4E5F\u6CA1\u6709\u3002&rdquo;<br><br>'
        + '&ldquo;\u5982\u679C\u4F60\u770B\u5230\u8FD9\u672C\u624B\u518C:'
        + '<br>\u6C38\u8FDC\u4E0D\u8981\u5728 \u041E\u0417\u0420 &lt; 15 \u65F6\u8FD0\u884C\u3002\u6C38\u8FDC\u4E0D\u8981\u3002&rdquo;</div>'
        + '<div style="text-align:right;font-size:10px;color:#8a8474;margin-top:6px;">&mdash; \u0410. \u00B7 26.04.1986 00:45</div></div>'
    },
  ];

  let manualPage = 0;
  let manualLang = 'zh';

  function renderManual() {
    const p = MANUAL[manualPage];
    gt('manual-page').innerHTML = p.body();
    gt('manual-pageno').textContent = (manualPage + 1) + ' / ' + MANUAL.length;
    gt('manual-spine').innerHTML = MANUAL.map(function(pg, i) {
      return '<div class="spine-tab' + (i === manualPage ? ' active' : '') + '" onclick="Props.gotoPage(' + i + ')">' + pg.tab + '</div>';
    }).join('');
  }

  function openManual() {
    gt('manual-overlay').classList.remove('hidden');
    renderManual();
  }
  function closeManual() {
    gt('manual-overlay').classList.add('hidden');
  }

  let clipTool = 'pen';
  function openClipboard() {
    var lines = '';
    for (var i = 0; i < 12; i++) {
      lines += '<input class="clip-line' + (clipTool === 'pencil' ? ' pencil' : '') + '" placeholder="' + (i === 0 ? '\u5728\u6B64\u4E66\u5199\u2026' : '') + '">';
    }
    showProp(
      '<div class="clipboard"><div class="clipboard-clip"></div><div class="clip-paper">'
      + '<div class="clip-header">\u0427\u0415\u0420\u041D\u041E\u0411\u042B\u041B\u042C\u0421\u041A\u0410\u042F \u0410\u042D\u0421 \u00B7 \u0411\u041B\u041E\u041A \u21164 \u00B7 \u041E\u041F\u0415\u0420\u0410\u0422\u0418\u0412\u041D\u042B\u0419 \u0416\u0423\u0420\u041D\u0410\u041B \u503C\u73ED\u65E5\u5FD7<br>'
      + 'Date: 26.04.1986   Operator: <input id="clip-name" placeholder="\u7B7E\u540D">'
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
    const text = '\u2550\u2550\u2550 \u041E\u041F\u0415\u0420\u0410\u0422\u0418\u0412\u041D\u042B\u0419 \u0416\u0423\u0420\u041D\u0410\u041B \u00B7 26.04.1986 \u2550\u2550\u2550\nOperator: ' + name + '\n\n' + lines.join('\n') + '\n\n(\u5BFC\u51FA\u81EA \u0420\u0411\u041C\u041A-1000 \u4EFF\u771F\u5668)';
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
    el.textContent = fmtDose(S.doseRate);
    el.style.color = S.doseRate > 1000 ? '#8a1f14' : '#2e2e1a';
    const tot = gt('dosi-total');
    if (tot) tot.textContent = S.doseTotal >= 1000 ? (S.doseTotal / 1000).toFixed(2) + ' \u043C\u0417\u0432' : S.doseTotal.toFixed(2) + ' \u043C\u043A\u0417\u0432';
    const cv = gt('dosi-canvas');
    if (cv) {
      const ctx = cv.getContext('2d');
      const W = cv.width, H = cv.height;
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H + 10, R = H + 2;
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
  function openPhone() {
    showProp(
      '<div class="phone" id="phone-body"><div class="phone-handset" id="phone-handset" onclick="Props.togglePhone()"></div>'
      + '<div class="phone-dial"></div><div class="phone-label">\u0412\u0427 \u00B7 \u0410\u042D\u0421-4 \u00B7 \u0414\u0418\u0421\u041F\u0415\u0422\u0427\u0415\u0420 \u8C03\u5EA6\u53F0</div>'
      + '<div class="phone-status" id="phone-status">&mdash; \u7EBF\u8DEF\u7A7A\u95F2 &mdash;</div>'
      + '<div class="clip-tools" style="margin-top:12px;"><button onclick="Props.closeProp()">\u2715 \u653E\u56DE</button></div></div>');
  }
  function togglePhone() {
    phoneLifted = !phoneLifted;
    const h = gt('phone-handset');
    const st = gt('phone-status');
    if (h) h.classList.toggle('lifted', phoneLifted);
    if (st) {
      st.textContent = phoneLifted
        ? '\u00AB\u0411\u043B\u043E\u043A \u0447\u0435\u0442\u044B\u0440\u0435, \u0434\u0438\u0441\u043F\u0435\u0442\u0447\u0435\u0440. \u0414\u043E\u043B\u043E\u0436\u0438\u0442\u0435 \u043C\u043E\u0449\u043D\u043E\u0441\u0442\u044C.\u00BB'
        : '&mdash; \u7EBF\u8DEF\u7A7A\u95F2 &mdash;';
    }
  }

  function openCoffee() {
    showProp(
      '<div class="coffee"><div class="coffee-steam">\u301C\u301C\u301C</div><div class="cup">\uD83E\uDD56</div>'
      + '<p>\u591C\u73ED\u7684\u8336\u5DF2\u7ECF\u51C9\u4E86\u3002<br>'
      + '<span style="font-size:9px;color:#b8b2a0;">01:23 \u00B7 \u8DDD\u79BB\u4EA4\u73ED\u8FD8\u6709 6 \u5C0F\u65F6 37 \u5206</span></p>'
      + '<div class="clip-tools" style="margin-top:12px;"><button onclick="Props.closeProp()">\u2715 \u653E\u56DE</button></div></div>');
  }

  function showProp(html) {
    stage.innerHTML = html;
    overlay.classList.remove('hidden');
  }
  function closeProp() {
    overlay.classList.add('hidden');
    stage.innerHTML = '';
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
          case 'coffee': openCoffee(); break;
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
    document.querySelectorAll('.manual-lang button').forEach(function(b) {
      b.addEventListener('click', function() {
        document.querySelectorAll('.manual-lang button').forEach(function(x) { x.classList.remove('active'); });
        b.classList.add('active');
        manualLang = b.dataset.lang;
        renderManual();
      });
    });
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
    isOpen: function() { return openProp; },
  };
})();
