export default function OG3() {
  return (
    <div
      style={{
        width: 1200,
        height: 630,
        background: "#0a0a0a",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "30px 50px",
          position: "relative",
          zIndex: 10,
        }}
      >
        <span
          style={{
            fontFamily: "monospace",
            fontSize: 18,
            fontWeight: 800,
            color: "#fff",
            letterSpacing: "-0.02em",
          }}
        >
          openvlt
        </span>
        <span
          style={{
            fontFamily: "monospace",
            fontSize: 12,
            letterSpacing: "0.15em",
            color: "#57534e",
          }}
        >
          openvlt.com
        </span>
      </div>

      {/* Screenshot, centered and prominent */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          position: "relative",
          padding: "0 50px",
        }}
      >
        {/* Glow behind */}
        <div
          style={{
            position: "absolute",
            width: 600,
            height: 400,
            borderRadius: "50%",
            background: "rgba(80, 180, 140, 0.06)",
            filter: "blur(100px)",
            top: "20%",
            left: "50%",
            transform: "translate(-50%, -50%)",
          }}
        />
        <div
          style={{
            position: "relative",
            zIndex: 5,
            perspective: "1200px",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/openvlt_demo.webp"
            alt=""
            style={{
              width: 900,
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
              transform: "rotateX(4deg)",
              transformOrigin: "bottom center",
            }}
          />
        </div>
        {/* Bottom fade */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 200,
            background: "linear-gradient(transparent, #0a0a0a)",
            zIndex: 6,
          }}
        />
      </div>

      {/* Bottom text */}
      <div
        style={{
          position: "absolute",
          bottom: 30,
          left: 0,
          right: 0,
          textAlign: "center",
          zIndex: 10,
        }}
      >
        <p
          style={{
            fontSize: 16,
            color: "#78716c",
            margin: 0,
          }}
        >
          Open source &middot; Self-hosted &middot; E2E Encrypted &middot;
          Markdown notes
        </p>
      </div>
    </div>
  )
}
