export default function OG1() {
  return (
    <div
      style={{
        width: 1200,
        height: 630,
        background: "#0a0a0a",
        display: "flex",
        overflow: "hidden",
        position: "relative",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Left: branding */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "60px 70px",
          position: "relative",
          zIndex: 10,
        }}
      >
        <p
          style={{
            fontFamily: "monospace",
            fontSize: 13,
            letterSpacing: "0.2em",
            color: "#78716c",
            marginBottom: 20,
          }}
        >
          OPEN SOURCE &middot; SELF-HOSTED &middot; ENCRYPTED
        </p>
        <h1
          style={{
            fontSize: 80,
            fontWeight: 900,
            letterSpacing: "-0.04em",
            lineHeight: 0.9,
            margin: 0,
            background: "linear-gradient(180deg, #fff 30%, rgba(255,255,255,0.3) 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          openvlt
        </h1>
        <p
          style={{
            fontSize: 20,
            color: "#a8a29e",
            marginTop: 20,
            lineHeight: 1.5,
            maxWidth: 400,
          }}
        >
          Your notes as plain markdown files on your server. No cloud. No
          compromise.
        </p>
        <div
          style={{
            marginTop: 30,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              background: "#fff",
              color: "#0a0a0a",
              padding: "10px 24px",
              borderRadius: 999,
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "monospace",
            }}
          >
            openvlt.com
          </div>
        </div>
      </div>

      {/* Right: screenshot */}
      <div
        style={{
          width: 580,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Glow */}
        <div
          style={{
            position: "absolute",
            width: 400,
            height: 400,
            borderRadius: "50%",
            background: "rgba(80, 180, 140, 0.08)",
            filter: "blur(80px)",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
          }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/openvlt_demo.webp"
          alt=""
          style={{
            width: 520,
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            position: "relative",
            zIndex: 5,
          }}
        />
        {/* Fade left edge */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 120,
            background: "linear-gradient(90deg, #0a0a0a, transparent)",
            zIndex: 6,
          }}
        />
      </div>

      {/* Subtle dots */}
      {Array.from({ length: 30 }).map((_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: 3,
            height: 3,
            borderRadius: "50%",
            background: "rgba(80, 180, 140, 0.2)",
            left: `${(i * 137.5) % 100}%`,
            top: `${(i * 73.7) % 100}%`,
          }}
        />
      ))}
    </div>
  )
}
