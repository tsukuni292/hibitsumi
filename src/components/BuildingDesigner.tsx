// 建物づくり：名前と部品を選ぶと、村・町・都市の姿をその場で見せる
import { PART_KEYS, PART_LABEL, PART_OPTIONS, type BuildingParts } from '../core/buildingLook';
import { BUILDING_NAME_MAX } from '../core/rules';
import { customSpriteName } from '../render/customBuilding';
import { SpriteImg } from './SpriteImg';

const TIERS = [['village', '村'], ['town', '町'], ['city', '都市']] as const;

interface Props {
  name: string;
  parts: BuildingParts;
  onName: (name: string) => void;
  onParts: (parts: BuildingParts) => void;
}

const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)]!;

export function BuildingDesigner({ name, parts, onName, onParts }: Props) {
  const randomize = () =>
    onParts(Object.fromEntries(PART_KEYS.map(k => [k, pick(Object.keys(PART_OPTIONS[k]))])) as unknown as BuildingParts);

  return (
    <fieldset className="field designer">
      <legend>建物づくり</legend>
      <label className="field">
        <span>建物の名前</span>
        <input value={name} maxLength={BUILDING_NAME_MAX} onChange={e => onName(e.target.value)} placeholder="例：茶道部室" required />
      </label>
      <div className="designer-preview">
        {TIERS.map(([tier, label]) => (
          <figure key={tier}>
            <SpriteImg name={customSpriteName(parts, tier)} scale={3} label={`${label}の姿`} />
            <figcaption>{label}</figcaption>
          </figure>
        ))}
      </div>
      <p className="hint">レベルが上がると、村 → 町 → 都市の姿に育ちます。</p>
      <div className="designer-grid">
        {PART_KEYS.map(k => (
          <label key={k} className="field">
            <span>{PART_LABEL[k]}</span>
            <select value={parts[k]} onChange={e => onParts({ ...parts, [k]: e.target.value })}>
              {Object.entries(PART_OPTIONS[k]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        ))}
      </div>
      <button type="button" className="btn small" onClick={randomize}>おまかせで選ぶ</button>
    </fieldset>
  );
}
