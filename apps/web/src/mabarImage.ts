import { crtImage, modeLabels, type RoomView } from "@nyambung/shared";
export async function createMabarImage(room: RoomView) {
  if (room.match?.phase !== "results")
    throw new Error("Pertandingan belum selesai.");
  await document.fonts.load('24px "Arcade Pixel"');
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#08090d";
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.strokeStyle = "#edcb78";
  ctx.lineWidth = 4;
  ctx.strokeRect(28, 28, 1024, 1294);
  const text = (
    value: string,
    x: number,
    y: number,
    size: number,
    color = "#edcb78",
    max = 930,
  ) => {
    ctx.fillStyle = color;
    ctx.font = `${size}px "Arcade Pixel", monospace`;
    ctx.fillText(value, x, y, max);
  };
  text("NYAMBUNG", 64, 120, 64);
  text(modeLabels[room.mode], 64, 195, 28, "#c69af2");
  text(room.name, 64, 250, 24);
  text("HASIL MABAR", 64, 325, 26, "#8ee07a");
  const players = [...room.members]
    .filter((p) => !p.spectator)
    .sort((a, b) => b.score - a.score);
  for (let n = 0; n < players.length; n++) {
    const p = players[n],
      y = 395 + n * 64;
    ctx.strokeStyle = "#39334c";
    ctx.beginPath();
    ctx.moveTo(64, y + 22);
    ctx.lineTo(1016, y + 22);
    ctx.stroke();
    text(`#${p.rank}`, 64, y, 22, "#c69af2", 75);
    let avatarX = 155;
    if (p.avatar)
      try {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.src = p.avatar;
        await image.decode();
        ctx.drawImage(image, avatarX, y - 30, 36, 36);
      } catch {
        /* Initials remain optional. */
      }
    text(p.name, 210, y, 20, "#f0e9cb", 590);
    text(String(p.score), 850, y, 25, "#edcb78", 150);
  }
  text("nyambung.web.id", 64, 1260, 26);
  const pixels = ctx.getImageData(0, 0, 1080, 1350);
  pixels.data.set(crtImage(pixels.data, 1080, 1350));
  ctx.putImageData(pixels, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Gambar gagal dibuat."))),
      "image/png",
    ),
  );
  return new File([blob], `nyambung-mabar-${room.match.id.slice(0, 8)}.png`, {
    type: "image/png",
  });
}
