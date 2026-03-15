export default function OG2() {
  return (
    <div
      style={{
        width: 1200,
        height: 630,
        background: "#0a0a0a",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        position: "relative",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Background screenshot, faded */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/openvlt_demo.webp"
        alt=""
        style={{
          position: "absolute",
          width: 1100,
          bottom: -80,
          borderRadius: 16,
          opacity: 0.15,
          filter: "blur(1px)",
        }}
      />
      {/* Gradient overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center 60%, transparent 0%, #0a0a0a 70%)",
          zIndex: 2,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, #0a0a0a 0%, transparent 30%, transparent 50%, #0a0a0a 85%)",
          zIndex: 2,
        }}
      />

      {/* Content */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <h1
          style={{
            fontSize: 120,
            fontWeight: 900,
            letterSpacing: "-0.05em",
            lineHeight: 0.85,
            margin: 0,
            background: "linear-gradient(180deg, #fff 20%, rgba(255,255,255,0.25) 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          openvlt
        </h1>
        <p
          style={{
            fontSize: 22,
            color: "#a8a29e",
            marginTop: 16,
            lineHeight: 1.5,
          }}
        >
          Open source, self-hosted, encrypted markdown notes
        </p>
        <div
          style={{
            marginTop: 24,
            fontFamily: "monospace",
            fontSize: 13,
            letterSpacing: "0.15em",
            color: "#57534e",
            display: "flex",
            gap: 20,
          }}
        >
          <span>E2E ENCRYPTED</span>
          <span>&middot;</span>
          <span>WORKS OFFLINE</span>
          <span>&middot;</span>
          <span>PLAIN MARKDOWN</span>
        </div>
      </div>

      {/* Ambient glow */}
      <div
        style={{
          position: "absolute",
          width: 500,
          height: 300,
          borderRadius: "50%",
          background: "rgba(80, 180, 140, 0.06)",
          filter: "blur(100px)",
          top: "30%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 1,
        }}
      />
    </div>
  )
}
