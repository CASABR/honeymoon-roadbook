import { NavLink } from "react-router-dom";
import { IcHome, IcMap, IcBed, IcTrain, IcMenu } from "./Icons";

const NAV_ITEMS = [
  { to: "/", label: "Oggi", Icon: IcHome },
  { to: "/viaggio", label: "Viaggio", Icon: IcMap },
  { to: "/alloggi", label: "Alloggi", Icon: IcBed },
  { to: "/trasporti", label: "Trasporti", Icon: IcTrain },
  { to: "/altro", label: "Altro", Icon: IcMenu },
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      {NAV_ITEMS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
        >
          <Icon size={22} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
