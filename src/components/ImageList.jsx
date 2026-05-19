export default function ImageList({ images, compact = false }) {
  if (!images?.length) return null;

  return (
    <div className={compact ? "imageGrid compactImages" : "imageGrid"}>
      {images.map((src, index) => (
        <img className="docImage" src={src} alt={`Hình ${index + 1}`} key={`${src.slice(0, 64)}-${index}`} />
      ))}
    </div>
  );
}
