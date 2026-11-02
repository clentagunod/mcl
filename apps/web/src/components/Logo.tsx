export function Logo() {
  return (
    <img
      className="app-logo"
      src={`${import.meta.env.BASE_URL}assets/logo.png`}
      alt="MCL Lending logo"
      width={80}
      height={80}
    />
  );
}
