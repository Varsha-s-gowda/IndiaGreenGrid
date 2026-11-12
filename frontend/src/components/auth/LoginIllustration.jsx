function Window({ x, y, width = 56, height = 28, dim = false }) {
  return (
    <g>
      <rect
        x={x - 2}
        y={y - 2}
        width={width + 4}
        height={height + 4}
        rx="3"
        fill="#a4b9a0"
        opacity="0.42"
      />
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx="2"
        fill="#ffd98f"
        opacity={dim ? 0.22 : 0.38}
        filter="url(#lg-soft)"
      />
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx="2"
        fill="url(#lg-window)"
        opacity={dim ? 0.85 : 1}
      />
      <path
        d={`M${x + 3} ${y + height - 3} L${x + width - 4} ${y + 3} L${x + width - 4} ${
          y + height - 3
        } Z`}
        fill="#fff8dc"
        opacity="0.18"
      />
      <rect
        x={x + 2}
        y={y + 2}
        width="7"
        height={height - 4}
        fill="#fff6dc"
        opacity="0.22"
      />
      <rect
        x={x + width - 9}
        y={y + 2}
        width="7"
        height={height - 4}
        fill="#fff6dc"
        opacity="0.18"
      />
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx="2"
        fill="none"
        stroke="#a97f45"
        strokeOpacity="0.55"
        strokeWidth="1.2"
      />
      <path
        d={`M${x + width / 2} ${y}v${height} M${x} ${y + height / 2}h${width}`}
        stroke="#a97f45"
        strokeOpacity="0.32"
        strokeWidth="1"
      />
      <rect
        x={x - 3}
        y={y + height + 1}
        width={width + 6}
        height="3"
        rx="1.5"
        fill="#f4f9ee"
        opacity="0.92"
      />
    </g>
  );
}

function Balcony({ y, width = 260 }) {
  const x = 256;
  return (
    <g>
      <rect
        x={x + 2}
        y={y}
        width={width - 4}
        height="18"
        rx="1.5"
        fill="url(#lg-glass)"
        stroke="#dff0e0"
        strokeOpacity="0.45"
        strokeWidth="1"
      />
      {Array.from({ length: 13 }).map((_, index) => (
        <line
          key={index}
          x1={x + 8 + index * 20}
          y1={y + 1}
          x2={x + 8 + index * 20}
          y2={y + 17}
          stroke="#eaf6ea"
          strokeOpacity="0.32"
          strokeWidth="1"
        />
      ))}
      <rect x={x} y={y - 2} width={width} height="3" rx="1.5" fill="#f1f8ec" />
      <rect x={x - 2} y={y + 18} width={width + 4} height="6" rx="2" fill="#f5f9ef" />
      <rect
        x={x - 2}
        y={y + 22}
        width={width + 4}
        height="3"
        rx="1.5"
        fill="#c3d5bd"
      />
      <rect x={x - 2} y={y + 25} width={width + 4} height="4" fill="#6f8a6e" opacity="0.34" />
    </g>
  );
}

export default function LoginIllustration({ className = "" }) {
  return (
    <svg
      viewBox="0 0 960 520"
      preserveAspectRatio="xMidYMax meet"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id="lg-sun-bloom" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff3b8" stopOpacity="0.58" />
          <stop offset="42%" stopColor="#f0eda0" stopOpacity="0.24" />
          <stop offset="72%" stopColor="#b9e89e" stopOpacity="0.09" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="lg-sun-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fffdf0" stopOpacity="0.9" />
          <stop offset="55%" stopColor="#fdf4bf" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#f2eaa6" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="lg-sun-core" cx="42%" cy="38%" r="62%">
          <stop offset="0%" stopColor="#fffefb" />
          <stop offset="28%" stopColor="#fff9d6" />
          <stop offset="60%" stopColor="#fdf1b0" />
          <stop offset="85%" stopColor="#f9e79c" />
          <stop offset="100%" stopColor="#f3df90" stopOpacity="0.14" />
        </radialGradient>
        <linearGradient id="lg-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f7fbf1" />
          <stop offset="55%" stopColor="#e6efdd" />
          <stop offset="100%" stopColor="#cbdcc6" />
        </linearGradient>
        <linearGradient id="lg-wall-side" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#b3c8af" />
          <stop offset="100%" stopColor="#8da88b" />
        </linearGradient>
        <linearGradient id="lg-wall-distant" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dce8d5" />
          <stop offset="100%" stopColor="#b6cbb1" />
        </linearGradient>
        <linearGradient id="lg-facade-shade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff3c6" stopOpacity="0.22" />
          <stop offset="38%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#375c3c" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id="lg-roof" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e4eedd" />
          <stop offset="100%" stopColor="#b2c6ae" />
        </linearGradient>
        <linearGradient id="lg-panel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#35699a" />
          <stop offset="52%" stopColor="#1e4269" />
          <stop offset="100%" stopColor="#102744" />
        </linearGradient>
        <linearGradient id="lg-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#16452c" />
          <stop offset="58%" stopColor="#0d2f1e" />
          <stop offset="100%" stopColor="#061a10" />
        </linearGradient>
        <radialGradient id="lg-window" cx="50%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#fff1bd" />
          <stop offset="55%" stopColor="#f9d386" />
          <stop offset="100%" stopColor="#e8a94f" />
        </radialGradient>
        <linearGradient id="lg-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dff0e2" stopOpacity="0.55" />
          <stop offset="50%" stopColor="#8fb9a0" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#5c866d" stopOpacity="0.32" />
        </linearGradient>
        <linearGradient id="lg-leaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#155c37" />
          <stop offset="100%" stopColor="#092c1a" />
        </linearGradient>
        <linearGradient id="lg-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#b9e89e" stopOpacity="0" />
          <stop offset="100%" stopColor="#8fd6a6" stopOpacity="0.22" />
        </linearGradient>
        <filter id="lg-soft" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>

      {/* Glowing sun */}
      <circle cx="262" cy="238" r="236" fill="url(#lg-sun-bloom)" />
      <circle cx="262" cy="238" r="146" fill="url(#lg-sun-halo)" />
      <circle cx="262" cy="238" r="98" fill="url(#lg-sun-core)" />
      <circle
        cx="262"
        cy="238"
        r="94"
        fill="none"
        stroke="#fff7cf"
        strokeOpacity="0.3"
        strokeWidth="9"
        filter="url(#lg-soft)"
      />
      <circle
        cx="262"
        cy="238"
        r="118"
        fill="none"
        stroke="#fffbe2"
        strokeOpacity="0.2"
        strokeWidth="1"
      />

      {/* Soft horizon glow behind the landscape */}
      <rect x="0" y="360" width="960" height="120" fill="url(#lg-haze)" opacity="0.5" />

      {/* Distant greenery on the left */}
      <g fill="#0f3d26" opacity="0.85">
        <circle cx="150" cy="362" r="58" />
        <circle cx="206" cy="334" r="46" />
        <circle cx="108" cy="336" r="38" />
      </g>
      <rect x="146" y="392" width="9" height="82" rx="3" fill="#0a2a18" />

      {/* Distant tree line on the right */}
      <g fill="#0f3d26" opacity="0.7">
        <circle cx="662" cy="404" r="30" />
        <circle cx="708" cy="416" r="24" />
        <circle cx="766" cy="400" r="34" />
        <circle cx="822" cy="418" r="26" />
        <circle cx="878" cy="404" r="30" />
        <circle cx="930" cy="416" r="22" />
      </g>

      {/* Distant wind turbines */}
      <g strokeLinecap="round">
        <g opacity="0.9">
          <rect x="611" y="334" width="3" height="120" rx="1.5" fill="#0a3320" />
          <rect x="611" y="334" width="1" height="120" fill="#2f7a4a" opacity="0.35" />
          <circle cx="612.5" cy="333" r="3.4" fill="#d7f5e2" />
          <g stroke="#cff3dd" strokeOpacity="0.72" strokeWidth="2.4">
            <line x1="612.5" y1="333" x2="612.5" y2="299" />
            <line x1="612.5" y1="333" x2="642" y2="349" />
            <line x1="612.5" y1="333" x2="583" y2="349" />
          </g>
          <circle cx="612.5" cy="333" r="1.8" fill="#eafaf0" />
        </g>

        <g opacity="0.68">
          <rect x="676" y="366" width="2.6" height="88" rx="1.3" fill="#0a3320" />
          <circle cx="677.3" cy="365" r="2.8" fill="#cbeedb" />
          <g stroke="#c4ecd6" strokeOpacity="0.62" strokeWidth="2">
            <line x1="677.3" y1="365" x2="677.3" y2="338" />
            <line x1="677.3" y1="365" x2="701" y2="378" />
            <line x1="677.3" y1="365" x2="653.6" y2="378" />
          </g>
        </g>

        <g opacity="0.62">
          <rect x="828" y="378" width="2.4" height="80" rx="1.2" fill="#0a3320" />
          <circle cx="829.2" cy="377" r="2.6" fill="#cbeedb" />
          <g stroke="#c4ecd6" strokeOpacity="0.58" strokeWidth="1.9">
            <line x1="829.2" y1="377" x2="829.2" y2="353" />
            <line x1="829.2" y1="377" x2="850" y2="389" />
            <line x1="829.2" y1="377" x2="808.4" y2="389" />
          </g>
        </g>

        <g opacity="0.46">
          <rect x="904" y="398" width="2.2" height="66" rx="1.1" fill="#0a3320" />
          <circle cx="905.1" cy="397" r="2.4" fill="#bfe6cf" />
          <g stroke="#b9e2ca" strokeOpacity="0.5" strokeWidth="1.6">
            <line x1="905.1" y1="397" x2="905.1" y2="377" />
            <line x1="905.1" y1="397" x2="921" y2="407" />
            <line x1="905.1" y1="397" x2="889.2" y2="407" />
          </g>
        </g>

        <g opacity="0.55">
          <rect x="90" y="392" width="2.2" height="62" rx="1.1" fill="#0a3320" />
          <circle cx="91.1" cy="391" r="2.4" fill="#bfe6cf" />
          <g stroke="#b9e2ca" strokeOpacity="0.55" strokeWidth="1.7">
            <line x1="91.1" y1="391" x2="91.1" y2="369" />
            <line x1="91.1" y1="391" x2="111" y2="401" />
            <line x1="91.1" y1="391" x2="71.2" y2="401" />
          </g>
        </g>
      </g>

      {/* Ground and greenery — painted behind the buildings so the house is never cut */}
      <rect x="0" y="452" width="960" height="68" fill="url(#lg-ground)" />
      <g fill="#14532d">
        <ellipse cx="70" cy="472" rx="72" ry="34" />
        <ellipse cx="190" cy="478" rx="82" ry="36" />
        <ellipse cx="320" cy="484" rx="86" ry="34" />
        <ellipse cx="470" cy="480" rx="92" ry="36" />
        <ellipse cx="612" cy="472" rx="86" ry="34" />
        <ellipse cx="706" cy="486" rx="78" ry="34" />
        <ellipse cx="808" cy="478" rx="88" ry="36" />
        <ellipse cx="912" cy="486" rx="84" ry="32" />
      </g>
      <g fill="#166534">
        <ellipse cx="120" cy="494" rx="80" ry="32" />
        <ellipse cx="262" cy="502" rx="92" ry="30" />
        <ellipse cx="422" cy="498" rx="96" ry="32" />
        <ellipse cx="562" cy="504" rx="92" ry="30" />
        <ellipse cx="694" cy="500" rx="72" ry="30" />
        <ellipse cx="786" cy="502" rx="86" ry="30" />
        <ellipse cx="898" cy="500" rx="80" ry="30" />
      </g>

      {/* Neighbourhood block in the middle distance */}
      <g>
        <polygon points="760,364 778,357 778,470 760,476" fill="#a3bb9f" />
        <rect x="640" y="364" width="120" height="106" rx="2" fill="url(#lg-wall-distant)" />
        <rect x="640" y="364" width="120" height="106" fill="url(#lg-facade-shade)" opacity="0.5" />
        <rect x="634" y="356" width="132" height="12" rx="3" fill="#cddcc4" />
        <rect x="634" y="356" width="132" height="3" rx="1.5" fill="#eaf2e5" opacity="0.8" />

        {/* Rooftop solar on the distant block */}
        <polygon
          points="648,356 712,356 704,342 640,342"
          fill="url(#lg-panel)"
          stroke="#a6d2ef"
          strokeOpacity="0.45"
          strokeWidth="1.4"
        />
        <g stroke="#8fc4e6" strokeOpacity="0.3" strokeWidth="0.9">
          <line x1="675" y1="342" x2="667" y2="356" />
          <line x1="653" y1="349" x2="717" y2="349" />
        </g>

        {/* Warm windows */}
        {[374, 404].map((y) => (
          <g key={y}>
            <rect x="654" y={y} width="24" height="18" rx="2" fill="url(#lg-window)" opacity="0.9" />
            <rect x="692" y={y} width="24" height="18" rx="2" fill="url(#lg-window)" opacity="0.62" />
          </g>
        ))}
        <rect x="640" y="396" width="120" height="4" rx="2" fill="#f1f8ec" opacity="0.75" />
        <rect x="640" y="436" width="120" height="4" rx="2" fill="#f1f8ec" opacity="0.55" />

        {/* Entrance */}
        <rect x="730" y="426" width="26" height="44" rx="2" fill="#cfe0c7" />
        <rect x="730" y="426" width="26" height="5" rx="2" fill="#a9c3a4" />
      </g>

      {/* Contact shadow under the hero building */}
      <ellipse cx="390" cy="482" rx="160" ry="13" fill="#061a10" opacity="0.35" />

      {/* Apartment building */}
      <g>
        {/* Side face and depth */}
        <polygon points="520,244 542,236 542,468 520,480" fill="url(#lg-wall-side)" />
        <g opacity="0.72">
          {[258, 312, 366, 420].map((y) => (
            <g key={y}>
              <rect x="526" y={y} width="7" height="22" rx="1.5" fill="url(#lg-window)" />
              <rect
                x="536"
                y={y}
                width="5"
                height="22"
                rx="1.5"
                fill="url(#lg-window)"
                opacity="0.65"
              />
            </g>
          ))}
        </g>

        {/* Main facade */}
        <rect x="252" y="238" width="268" height="242" rx="3" fill="url(#lg-wall)" />
        <rect x="252" y="238" width="268" height="242" fill="url(#lg-facade-shade)" />
        <rect x="252" y="244" width="268" height="20" fill="#3f5f45" opacity="0.14" />
        <rect x="252" y="238" width="5" height="242" fill="#ffffff" opacity="0.4" />
        <rect x="515" y="238" width="5" height="242" fill="#7f9c7e" opacity="0.2" />

        {/* Roof coping */}
        <rect x="244" y="228" width="300" height="16" rx="3" fill="url(#lg-roof)" />
        <rect x="244" y="228" width="300" height="4" rx="2" fill="#f6fbf1" />
        <rect x="244" y="243" width="300" height="4" fill="#7d967b" opacity="0.3" />

        {/* Solar arrays */}
        <g strokeLinejoin="round">
          <polygon
            points="250,228 382,228 378,233 246,233"
            fill="#527254"
            opacity="0.26"
          />
          <polygon
            points="392,228 498,228 494,233 388,233"
            fill="#527254"
            opacity="0.26"
          />

          <polygon
            points="250,228 382,228 402,190 270,190"
            fill="url(#lg-panel)"
            stroke="#a6d2ef"
            strokeOpacity="0.55"
            strokeWidth="1.6"
          />
          <polygon
            points="392,228 498,228 518,196 412,196"
            fill="url(#lg-panel)"
            stroke="#a6d2ef"
            strokeOpacity="0.55"
            strokeWidth="1.6"
          />

          <g stroke="#8fc4e6" strokeOpacity="0.34" strokeWidth="1">
            <line x1="303" y1="190" x2="283" y2="228" />
            <line x1="336" y1="190" x2="316" y2="228" />
            <line x1="369" y1="190" x2="349" y2="228" />
            <line x1="263.4" y1="202.5" x2="395.4" y2="202.5" />
            <line x1="256.8" y1="215.1" x2="388.8" y2="215.1" />

            <line x1="438.5" y1="196" x2="418.5" y2="228" />
            <line x1="465" y1="196" x2="445" y2="228" />
            <line x1="491.5" y1="196" x2="471.5" y2="228" />
            <line x1="405.4" y1="206.6" x2="511.4" y2="206.6" />
            <line x1="398.8" y1="217.1" x2="504.8" y2="217.1" />
          </g>

          <path
            d="M284 224 394 198"
            stroke="#ffffff"
            strokeOpacity="0.2"
            strokeWidth="7"
            strokeLinecap="round"
          />
          <path
            d="M424 224 508 204"
            stroke="#ffffff"
            strokeOpacity="0.18"
            strokeWidth="6"
            strokeLinecap="round"
          />

          <line
            x1="250"
            y1="228"
            x2="382"
            y2="228"
            stroke="#557b9b"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <line
            x1="392"
            y1="228"
            x2="498"
            y2="228"
            stroke="#557b9b"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>

        {/* Rooftop inverter */}
        <g>
          <rect
            x="470"
            y="234"
            width="16"
            height="9"
            rx="1.5"
            fill="#dfe9da"
            stroke="#9db49a"
            strokeWidth="1"
          />
          <circle cx="474" cy="238.5" r="1.5" fill="#34d399" />
        </g>

        {/* Warm rim light from the sun */}
        <path d="M252 478V239" stroke="#fff1bd" strokeOpacity="0.4" strokeWidth="2" />
        <path d="M246 229H526" stroke="#fff7d2" strokeOpacity="0.5" strokeWidth="2" />

        {/* Residential floors */}
        {[246, 300, 354].map((y) => (
          <g key={y}>
            <Window x={270} y={y} />
            <Window x={356} y={y} />
            <Window x={442} y={y} dim={y === 300} />
            <Balcony y={y + 28} />
          </g>
        ))}

        {/* Balcony plants */}
        <g>
          <rect x="477" y="337" width="12" height="7" rx="1.5" fill="#b9855a" />
          <rect x="476" y="336" width="14" height="2" rx="1" fill="#d8a874" />
          <circle cx="480" cy="333" r="6" fill="#2f8f57" />
          <circle cx="485" cy="330" r="5" fill="#43a96b" />
          <circle cx="488" cy="334" r="4" fill="#2a7a4a" />

          <rect x="281" y="391" width="11" height="6" rx="1.5" fill="#b9855a" />
          <rect x="280" y="390" width="13" height="2" rx="1" fill="#d8a874" />
          <circle cx="284" cy="387" r="5.5" fill="#2f8f57" />
          <circle cx="288" cy="384" r="4.5" fill="#43a96b" />
          <circle cx="291" cy="388" r="3.5" fill="#2a7a4a" />
        </g>

        {/* Ground floor */}
        <Window x={272} y={420} height={30} />
        <Window x={444} y={420} height={30} />
        <rect x="342" y="408" width="88" height="7" rx="3" fill="#2d744c" />
        <rect x="342" y="408" width="88" height="2.5" rx="1.5" fill="#3d8f60" />
        <rect x="342" y="414" width="88" height="3" fill="#1f4a33" opacity="0.5" />
        <rect x="352" y="414" width="68" height="54" rx="3" fill="url(#lg-window)" />
        <rect
          x="352"
          y="414"
          width="68"
          height="54"
          rx="3"
          fill="none"
          stroke="#7a5a34"
          strokeOpacity="0.6"
          strokeWidth="1.4"
        />
        <line
          x1="386"
          y1="414"
          x2="386"
          y2="468"
          stroke="#7a5a34"
          strokeOpacity="0.5"
          strokeWidth="1.2"
        />
        <line
          x1="352"
          y1="428"
          x2="420"
          y2="428"
          stroke="#7a5a34"
          strokeOpacity="0.35"
          strokeWidth="1"
        />
        <line
          x1="381"
          y1="444"
          x2="381"
          y2="452"
          stroke="#7a5a34"
          strokeOpacity="0.7"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <line
          x1="391"
          y1="444"
          x2="391"
          y2="452"
          stroke="#7a5a34"
          strokeOpacity="0.7"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path d="M356 464 382 418v46Z" fill="#fff8dc" opacity="0.22" />
        <path d="M390 464 416 418v46Z" fill="#fff8dc" opacity="0.16" />
        <circle cx="344" cy="428" r="2.6" fill="#ffe6a8" />
        <circle cx="428" cy="428" r="2.6" fill="#ffe6a8" />
        <circle cx="344" cy="428" r="8" fill="#ffe6a8" opacity="0.25" filter="url(#lg-soft)" />
        <circle cx="428" cy="428" r="8" fill="#ffe6a8" opacity="0.25" filter="url(#lg-soft)" />
        <rect x="338" y="468" width="96" height="6" rx="2" fill="#dbe7d5" />
        <rect x="332" y="474" width="108" height="5" rx="2" fill="#bfd0ba" />
        <rect x="252" y="468" width="268" height="12" fill="#b7c9b2" opacity="0.55" />
      </g>

      {/* Foreground highlights */}
      <g fill="#22c55e" opacity="0.14">
        <ellipse cx="152" cy="482" rx="42" ry="16" />
        <ellipse cx="350" cy="490" rx="46" ry="16" />
        <ellipse cx="520" cy="486" rx="50" ry="16" />
        <ellipse cx="650" cy="492" rx="40" ry="15" />
        <ellipse cx="780" cy="488" rx="46" ry="16" />
        <ellipse cx="920" cy="492" rx="44" ry="15" />
      </g>

      {/* Foreground foliage */}
      <g>
        <path
          d="M-14 520C-4 432 30 368 100 326c-4 56-24 116-62 164-18 24-36 32-52 30Z"
          fill="url(#lg-leaf)"
        />
        <path
          d="M-18 520c30-64 74-106 138-132-20 44-52 90-98 120-16 10-30 14-40 12Z"
          fill="#10402a"
        />
        <path
          d="M4 512C30 452 62 408 108 380"
          fill="none"
          stroke="#2f7a4a"
          strokeOpacity="0.35"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M960 520c-10-66-44-114-100-142 3 48 21 98 55 130 14 14 30 16 45 12Z"
          fill="#0b2f1d"
        />
        <path
          d="M960 520c-4-44-20-82-46-108 12 34 22 72 20 108Z"
          fill="#0d3a24"
        />
      </g>
    </svg>
  );
}
