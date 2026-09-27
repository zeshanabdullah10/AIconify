import { useState } from 'react';
import { buttonBox, buttonState, STATUS, statusVariant, viIcon, type StatusId } from '../lib/labview';
import { buttonOptions, exportable, iconAt } from '../lib/exporter';
import { indicatorFiles, INDICATOR_KINDS, type IndicatorKind } from '../lib/indicators';
import { withCurrentColor } from '../lib/svg';
import type { ExportOptions, IconItem, Project } from '../lib/types';
import { Segmented, SvgView, cx } from './ui';

type View = 'panel' | 'hmi' | 'web' | 'sizes';

/**
 * The set shown where it will live: a LabVIEW front panel, an ISA-101 HMI screen, a web toolbar,
 * and every icon at the sizes it will be used. Everything is drawn by the same code as the zip.
 */
export function InPlace({ project, o }: { project: Project; o: ExportOptions }) {
  const icons = exportable(project.icons);
  const first: View = o.targets.includes('labview') ? 'panel' : o.targets.includes('hmi') ? 'hmi' : 'web';
  const [view, setView] = useState<View>(first);
  if (!icons.length) return null;
  // Icons with a state part show states best; put them first.
  const byParts = [...icons].sort((a, b) => Number(b.svg!.includes('class="active"')) - Number(a.svg!.includes('class="active"')));
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-line">
        <h2 className="flex-1 min-w-0 text-[14px] font-semibold">See it in place</h2>
        <Segmented
          size="sm"
          label="Preview"
          value={view}
          onChange={setView}
          options={[
            { value: 'panel', label: 'Front panel' },
            { value: 'hmi', label: 'HMI screen' },
            { value: 'web', label: 'Web' },
            { value: 'sizes', label: 'Sizes' },
          ]}
        />
      </div>
      <div className="p-4 grid-paper">
        {view === 'panel' ? <FrontPanel project={project} o={o} icons={byParts} /> : null}
        {view === 'hmi' ? <HmiScreen project={project} o={o} icons={byParts} /> : null}
        {view === 'web' ? <Web project={project} o={o} icons={icons} /> : null}
        {view === 'sizes' ? <Sizes project={project} o={o} icons={icons} /> : null}
      </div>
      <p className="px-4 py-2 text-[12px] text-ink-3 border-t border-line">Drawn by the same code that writes the zip.</p>
    </div>
  );
}

function Img({ svg, w, h, label }: { svg: string; w: number; h?: number; label?: string }) {
  return (
    <span className="block shrink-0" style={{ width: w, height: h ?? w }}>
      <SvgView svg={svg} label={label} />
    </span>
  );
}

function FrontPanel({ project, o, icons }: { project: Project; o: ExportOptions; icons: IconItem[] }) {
  const opts = buttonOptions(project, o);
  const [bw, bh] = buttonBox(o.buttonShape);
  const w = Math.round((o.buttonSize * bw) / 48);
  const h = Math.round((o.buttonSize * bh) / 48);
  const kinds = o.indicatorKinds.filter((k): k is IndicatorKind => INDICATOR_KINDS.some((x) => x.id === k));
  const leds = kinds.filter((k) => k !== 'tank').slice(0, 1);
  const vi = viIcon(iconAt(project, o, icons[0].svg!, 20), { banner: o.bannerText, bannerColor: o.bannerColor || undefined, pixel: project.style.style === 'pixel' });
  return (
    <figure aria-label="LabVIEW front panel preview" className="m-0 rounded-[8px] overflow-hidden shadow-[0_8px_30px_rgb(0_0_0/0.12),0_0_0_1px_rgb(0_0_0/0.18)] text-[#1d1d1f] bg-[#f3f3f3]">
      <div className="flex items-center gap-3 px-3 h-9 bg-[#fbfbfb] border-b border-[#d6d6d6] text-[12px]">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="w-2.5 h-2.5 rounded-full bg-[#d0d0d0]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#d0d0d0]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#d0d0d0]" />
        </span>
        <span className="flex-1 truncate text-center font-medium">{project.brand.name || 'Main'}.vi Front Panel</span>
        <span className="w-9" />
      </div>
      <div className="flex items-center gap-4 px-3 h-7 bg-[#f3f3f3] border-b border-[#dadada] text-[11px] text-[#444]">
        {['File', 'Edit', 'View', 'Project', 'Operate', 'Tools', 'Window', 'Help'].map((m) => (
          <span key={m} aria-hidden="true" className="hidden sm:inline">{m}</span>
        ))}
        <span className="flex-1" />
        <span className="w-8 h-8 -my-1 border border-[#bdbdbd] bg-white">
          <Img svg={vi} w={30} label="VI icon" />
        </span>
      </div>
      <div className="panel-face p-6 min-h-[220px] flex flex-wrap gap-x-7 gap-y-6 items-end content-start">
        {icons.slice(0, 6).map((icon, i) => {
          const on = i % 2 === 1;
          return (
            <div key={icon.id} className="flex flex-col gap-1 text-[11px]">
              <span>{icon.name}</span>
              <span className="relative block" style={{ width: w, height: h }}>
                <SvgView svg={buttonState(iconAt(project, o, icon.svg!), on ? 'true' : 'false', opts)} label={`${icon.name} button, ${on ? 'true' : 'false'}`} />
                {o.buttonShape === 'wide' && o.buttonSkin !== 'toggle' ? (
                  <span className="absolute inset-y-0 flex items-center font-semibold text-[11px] tracking-wide" style={{ left: h + 2 }}>
                    {on ? 'ON' : 'OFF'}
                  </span>
                ) : null}
              </span>
            </div>
          );
        })}
        {leds.map((k) =>
          o.indicatorColors.slice(0, 2).map((c) => {
            const [off, on] = indicatorFiles(k, c);
            return (
              <div key={`${k}${c}`} className="flex flex-col gap-1 text-[11px] items-center">
                <span>Status</span>
                <span className="flex gap-1.5">
                  <Img svg={on.svg} w={o.indicatorSize} label={on.name} />
                  <Img svg={off.svg} w={o.indicatorSize} label={off.name} />
                </span>
              </div>
            );
          }),
        )}
        {kinds.includes('tank') ? (
          <div className="flex flex-col gap-1 text-[11px] items-center">
            <span>Level</span>
            <Img svg={indicatorFiles('tank', o.indicatorColors[0] ?? '#2fb344')[2].svg} w={o.indicatorSize * 1.5} label="Tank at 50%" />
          </div>
        ) : null}
      </div>
    </figure>
  );
}

const HMI_STATES: StatusId[] = ['on', 'off', 'warning', 'alarm', 'manual'];

function HmiScreen({ project, o, icons }: { project: Project; o: ExportOptions; icons: IconItem[] }) {
  const items = icons.slice(0, 5);
  const label = (s: StatusId) => STATUS.find((x) => x.id === s)!.label;
  const alarms = items.filter((_, i) => HMI_STATES[i] === 'alarm').length;
  const warnings = items.filter((_, i) => HMI_STATES[i] === 'warning').length;
  return (
    <figure aria-label="HMI screen preview" className="m-0 rounded-[8px] overflow-hidden shadow-[0_8px_30px_rgb(0_0_0/0.12),0_0_0_1px_rgb(0_0_0/0.18)] text-[#1d1d1f] bg-[#dcdcdc]">
      <div className="flex items-center gap-3 px-4 h-10 bg-[#c8c8c8] text-[12px]">
        <span className="flex-1 font-medium">Unit 1 · Overview</span>
        <span>{alarms} alarm · {warnings} warning</span>
      </div>
      <div className="relative px-5 pt-8 pb-5">
        {/* The process line the equipment sits on. */}
        <div className="absolute left-8 right-8 top-[56px] h-[3px] bg-[#8e8e93]" aria-hidden="true" />
        <ul className="relative flex justify-between gap-3">
          {items.map((icon, i) => {
            const state = HMI_STATES[i];
            return (
              <li key={icon.id} className="flex flex-col items-center gap-2 text-[11px] text-center min-w-0">
                <span className="rounded-[8px] bg-[#dcdcdc] p-1">
                  <Img svg={statusVariant(iconAt(project, o, icon.svg!, 48), state, { onColor: o.stateColor || undefined })} w={48} label={`${icon.name}, ${label(state)}`} />
                </span>
                <span className="font-medium truncate max-w-[80px]">{icon.name}</span>
                <span className={cx('text-[#6e6e73]', (state === 'alarm' || state === 'warning') && 'font-semibold text-[#1d1d1f]')}>{label(state)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </figure>
  );
}

function Web({ project, o, icons }: { project: Project; o: ExportOptions; icons: IconItem[] }) {
  const nav = icons.slice(0, 5);
  const panel = (dark: boolean) => (
    <div className={cx('rounded-[8px] p-3 flex flex-col gap-3 shadow-[0_0_0_1px_rgb(0_0_0/0.14)]', dark ? 'bg-[#1c1c1e] text-white' : 'bg-white text-[#1d1d1f]')}>
      <nav className="flex gap-1 flex-wrap">
        {nav.map((icon, i) => (
          <span key={icon.id} className={cx('flex items-center gap-1.5 h-8 px-2.5 rounded-[8px] text-[12px]', i === 0 && (dark ? 'bg-white/10' : 'bg-[#f2f2f4]'))}>
            <Img svg={withCurrentColor(iconAt(project, o, icon.svg!, 16))} w={16} />
            {icon.name}
          </span>
        ))}
      </nav>
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-2 h-9 px-3.5 rounded-full text-[13px] font-medium text-white" style={{ background: project.style.primary }}>
          <span className="text-white">
            <Img svg={withCurrentColor(iconAt(project, o, icons[0].svg!, 20))} w={18} />
          </span>
          {icons[0].name}
        </span>
        {icons.slice(5, 9).map((icon) => (
          <Img key={icon.id} svg={withCurrentColor(iconAt(project, o, icon.svg!, 24))} w={24} label={icon.name} />
        ))}
      </div>
    </div>
  );
  return (
    <div aria-label="Web preview" className="grid sm:grid-cols-2 gap-3">
      {panel(false)}
      {panel(true)}
    </div>
  );
}

function Sizes({ project, o, icons }: { project: Project; o: ExportOptions; icons: IconItem[] }) {
  const list = icons.slice(0, 10);
  return (
    <div aria-label="Sizes preview" className="grid gap-3">
      {[false, true].map((dark) => (
        <div key={String(dark)} className={cx('rounded-[8px] p-3 flex flex-col gap-3 shadow-[0_0_0_1px_rgb(0_0_0/0.14)]', dark ? 'bg-[#1c1c1e] text-white' : 'bg-white text-[#1d1d1f]')}>
          {[16, 24, 32, 48].map((px) => (
            <div key={px} className="flex items-center gap-2.5 flex-wrap">
              <span className="w-7 text-[11px] font-mono opacity-60">{px}</span>
              {list.map((icon) => (
                <Img key={icon.id} svg={withCurrentColor(iconAt(project, o, icon.svg!, px))} w={px} />
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
