import { APP_ICON_SIZES, renderAppIcon } from "../../../components/app-icon.tsx";

export const dynamicParams = false;

export function generateStaticParams() {
  return APP_ICON_SIZES.map((size) => ({ size: String(size) }));
}

export async function GET(_request: Request, { params }: RouteContext<"/app-icon/[size]">) {
  const { size } = await params;
  return renderAppIcon(Number(size));
}
