import React, { useContext, useEffect } from 'react'
import isSameWeek from 'date-fns/isSameWeek'

import {
  DateType,
  InnerLocale,
  RangeValue,
  EventValue,
  InnerLocaleKey,
  DisabledTimes,
  PanelMode,
  SharedTimeProps,
  PickerMode,
  TimeUnit,
} from './interface'
import ConfigContext from '../config-provider/ConfigContext'
import { useMergedState, useOnClickOutside } from '../_utils/hooks'
import { getCompProps } from '../_utils'
import Context from './context'
import Panel from './date-panel'
import InputDate, { InputRangeProps } from './range/input-range'
import {
  generateUnits,
  getClosingViewDate,
  getDataOrAriaProps,
  getDefaultFormat,
  getValue,
  updateValues,
} from './utils'
import useValueTexts from './hooks/use-value-texts'
import useHoverValue from './hooks/use-hover-value'
import {
  formatDate,
  isAfter,
  newDate,
  parseDate,
  isEqual,
  isSameQuarter,
  isSameDay,
  isValid,
  getHours,
  getMinutes,
  getSeconds,
} from './utils/date-fns'
import useTextValueMapping from './hooks/use-text-value-mapping'
import useRangeViewDates from './hooks/use-range-view-dates'
import { getCompLangMsg } from '../locale'
import useRangeDisabled from './hooks/use-range-disabled'
import { PickerBaseProps, PickerDateProps, PickerTimeProps } from './date-picker'
import getExtraFooter from './utils/get-extra-footer'
import getRanges from './utils/get-ranges'
import classNames from 'classnames'
import usePopper from '../_utils/usePopper'

// type RangePickerProps = RangeDateProps | RangeMonthProps | RangeWeekProps | RangeQuarterProps | RangeYearProps

export type RangeType = 'start' | 'end'

export interface RangeInfo {
  range: RangeType
}

export type RangeDateRender = (currentDate: DateType, today: DateType, info: RangeInfo) => React.ReactNode

export interface RangePickerSharedProps {
  id?: string
  value?: RangeValue
  defaultValue?: RangeValue
  defaultPickerValue?: [DateType, DateType]
  placeholder?: [string, string]
  disabled?: boolean | [boolean, boolean]
  disabledTimePanel?: (date: EventValue, type: RangeType) => DisabledTimes
  ranges?: Record<string, DateType[] | (() => DateType[])>
  separator?: React.ReactNode
  allowEmpty?: [boolean, boolean]
  suffixIcon?: React.ReactNode
  mode?: [PanelMode, PanelMode]
  onChange?: (values: RangeValue, formatString: [string | null, string | null]) => void
  onCalendarChange?: (values: RangeValue, formatString: [string | null, string | null], info: RangeInfo) => void
  onPanelChange?: (values: RangeValue, modes: [PanelMode, PanelMode]) => void
  onFocus?: React.FocusEventHandler<HTMLInputElement>
  onBlur?: React.FocusEventHandler<HTMLInputElement>
  onOk?: (dates: RangeValue) => void
  activePickerIndex?: 0 | 1
  dateRender?: RangeDateRender
  panelRender?: (originPanel: React.ReactNode) => React.ReactNode
}

type OmitPickerProps<Props> = Omit<
  Props,
  | 'value'
  | 'defaultValue'
  | 'defaultPickerValue'
  | 'placeholder'
  | 'disabled'
  | 'disabledTimePanel'
  | 'showToday'
  | 'showTime'
  | 'mode'
  | 'onChange'
  | 'onSelect'
  | 'onPanelChange'
  | 'pickerValue'
  | 'onPickerValueChange'
  | 'onOk'
  | 'dateRender'
>

export type RangeShowTimeObject = Omit<SharedTimeProps, 'defaultValue'> & {
  defaultValue?: DateType[]
}

export interface RangePickerBaseProps extends RangePickerSharedProps, OmitPickerProps<PickerBaseProps> {}

export interface RangePickerDateProps extends RangePickerSharedProps, OmitPickerProps<PickerDateProps> {
  showTime?: boolean | RangeShowTimeObject
}

export interface RangePickerTimeProps extends RangePickerSharedProps, OmitPickerProps<PickerTimeProps> {
  order?: boolean
}

export type RangePickerProps = RangePickerBaseProps | RangePickerDateProps | RangePickerTimeProps

// TMP type to fit for ts 3.9.2
type OmitType = Omit<RangePickerBaseProps, 'picker'> &
  Omit<RangePickerDateProps, 'picker'> &
  Omit<RangePickerTimeProps, 'picker'>

interface MergedRangePickerProps extends OmitType {
  picker?: PickerMode
}

export type RangeArray = { key: string; newValue: RangeValue }[]

// 范围时间顺序错误时重新排序
function reorderValues(values: RangeValue): RangeValue {
  if (values && values[0] && values[1] && isAfter(values[0] as DateType, values[1] as DateType)) {
    return [values[1], values[0]]
  }

  return values
}

// 范围时间顺序错误时报错
function isErrorValues(values: RangeValue): boolean {
  if (values && values[0] && values[1] && isAfter(values[0] as DateType, values[1] as DateType)) {
    console.error('开始日期在结束日期之后')
    return true
  }

  return false
}

// 是否可以切换选择器
function canValueTrigger(
  value: EventValue,
  index: number,
  disabled: [boolean, boolean],
  allowEmpty?: [boolean, boolean] | null,
): boolean {
  if (value) {
    return true
  }

  if (allowEmpty && allowEmpty[index]) {
    return true
  }

  if (disabled[(index + 1) % 2]) {
    return true
  }

  return false
}

function DatePicker(props: Partial<RangePickerProps>) {
  const { prefixCls: customPrefixcls } = props

  const {
    getPrefixCls,
    prefixCls,
    compDefaultProps: userDefaultProps,
    locale: globalLocale,
  } = useContext(ConfigContext)
  const datePickerProps = getCompProps('RangePicker', userDefaultProps, props)
  const datePickerPrefixCls = getPrefixCls!(prefixCls, 'date-picker', customPrefixcls)

  const {
    allowClear,
    value,
    defaultValue,
    mode,
    picker = 'date',
    defaultOpen,
    open,
    disabled,
    inputReadOnly,
    size,
    placeholder,
    allowEmpty,
    className,
    style,
    borderType,
    separator,
    ranges,

    format,
    showTime,
    yearItemNumber,
    use12Hours,
    defaultPickerValue,
    order,
    locale,
    components,
    hourStep = 1,
    minuteStep = 1,
    secondStep = 1,
    suffixIcon,

    renderExtraFooter,
    disabledHours,
    disabledMinutes,
    disabledSeconds,
    disabledDate,
    onOpenChange,
    // onPanelChange,
    onChange,
    onCalendarChange,
    onFocus,
    onBlur,
    onOk,
  } = datePickerProps as MergedRangePickerProps

  const needConfirmButton: boolean = (picker === 'date' && !!showTime) || picker === 'time'

  const datePickerLang: InnerLocale = locale
    ? getCompLangMsg({ componentName: 'DatePicker' }, (_componentName: string, label: InnerLocaleKey) => {
        return locale[label]
      })
    : globalLocale.getCompLangMsg({ componentName: 'DatePicker' })
  // ref
  const panelDivRef = React.useRef<HTMLDivElement>(null)
  const inputDivRef = React.useRef<HTMLDivElement>(null)
  const startInputDivRef = React.useRef<HTMLDivElement>(null)
  const endInputDivRef = React.useRef<HTMLDivElement>(null)
  const separatorRef = React.useRef<HTMLDivElement>(null)
  const startInputRef = React.useRef<HTMLInputElement>(null)
  const endInputRef = React.useRef<HTMLInputElement>(null)
  const popperRef = React.useRef<HTMLInputElement>(null)

  const openRecordsRef = React.useRef<Record<number, boolean>>({})

  const mergedDisabled = React.useMemo<[boolean, boolean]>(() => {
    if (Array.isArray(disabled)) {
      return disabled
    }

    return [disabled || false, disabled || false]
  }, [disabled])

  const _format = getDefaultFormat(format, picker, showTime, use12Hours)

  // Active picker
  const [mergedActivePickerIndex, setMergedActivePickerIndex] = useMergedState<0 | 1>(0, {
    // value: activePickerIndex,
  })
  // 原始数据
  const [dateValue, setInnerValue] = useMergedState<RangeValue>(null, {
    value,
    defaultValue,
    postState: (values) => {
      if (picker === 'time' || (picker === 'date' && showTime)) {
        return order ? reorderValues(values) : values
      } else {
        if (isErrorValues(values)) {
          return [values![0], null]
        }
        return values
      }
    },
  })

  // 选中的数据
  const [selectedValue, setSelectedValue] = useMergedState<RangeValue>(null, {
    defaultValue: dateValue,
    postState: (values) => {
      let postValues = values

      if (mergedDisabled[0] && mergedDisabled[1]) {
        return postValues
      }

      // Fill disabled unit
      for (let i = 0; i < 2; i++) {
        if (mergedDisabled[i] && !getValue(postValues, i) && !getValue(allowEmpty, i)) {
          postValues = updateValues(postValues, newDate(), i)
        }
      }
      return postValues
    },
  })

  let hours: TimeUnit[]
  let minutes: TimeUnit[]
  let seconds: TimeUnit[]
  let originHour: number
  let minute: number
  let second: number
  let disabledTimePanel = false

  if (picker === 'time' || (picker === 'date' && showTime)) {
    originHour = -1
    minute = -1
    second = -1
    if (selectedValue && selectedValue[mergedActivePickerIndex]) {
      originHour = getHours(selectedValue[mergedActivePickerIndex] as DateType)
      minute = selectedValue ? getMinutes(selectedValue[mergedActivePickerIndex] as DateType) : -1
      second = selectedValue ? getSeconds(selectedValue[mergedActivePickerIndex] as DateType) : -1
    }
    hours = generateUnits(0, 23, hourStep, disabledHours && disabledHours())
    minutes = generateUnits(0, 59, minuteStep, disabledMinutes && disabledMinutes(originHour))
    seconds = generateUnits(0, 59, secondStep, disabledSeconds && disabledSeconds(originHour, minute))
    if (
      (hours && !hours.find((n) => !n.disabled)) ||
      (minutes && !minutes.find((n) => !n.disabled)) ||
      (seconds && !seconds.find((n) => !n.disabled))
    ) {
      disabledTimePanel = true
    }
  }

  // 面板展示日期
  const [getViewDate, setViewDate] = useRangeViewDates({
    values: dateValue,
    picker,
    defaultDates: defaultPickerValue,
  })

  // text
  const startValueTexts = useValueTexts(getValue(selectedValue, 0), { format: _format })

  const endValueTexts = useValueTexts(getValue(selectedValue, 1), { format: _format })

  const onTextChange = (newText: string, index: 0 | 1) => {
    let inputTempDate
    if (newText === '') {
      if (index === 0 && selectedValue && selectedValue.length === 2) {
        inputTempDate = selectedValue[1]
      } else if (index === 1 && selectedValue && selectedValue.length === 2) {
        inputTempDate = selectedValue[0]
      }
      if (inputTempDate) {
        setSelectedValue(updateValues(selectedValue, inputTempDate, index))
        setViewDate(inputTempDate, index)
      }
    } else if (newText && newText.length === _format.length) {
      inputTempDate = parseDate(newText, _format)

      const disabledFunc = index === 0 ? disabledStartDate : disabledEndDate
      if (inputTempDate && (!disabledFunc || !disabledFunc(inputTempDate))) {
        if (picker !== 'year') {
          setSelectedValue(updateValues(selectedValue, inputTempDate, index))
          setViewDate(inputTempDate, index)
        } else if (isValid(inputTempDate)) {
          setSelectedValue(updateValues(selectedValue, inputTempDate, index))
          setViewDate(inputTempDate, index)
        }
      }
    }
  }

  // input 展示
  const [startText, triggerStartTextChange, resetStartText] = useTextValueMapping({
    valueText: startValueTexts,
    onTextChange: (newText) => onTextChange(newText, 0),
  })

  const [endText, triggerEndTextChange, resetEndText] = useTextValueMapping({
    valueText: endValueTexts,
    onTextChange: (newText) => onTextChange(newText, 1),
  })

  const [hoverRangedValue, setHoverRangedValue] = React.useState<RangeValue>([null, null])

  const [startHoverValue, onStartEnter, onStartLeave] = useHoverValue(startText, {
    format: _format,
  })

  const [endHoverValue, onEndEnter, onEndLeave] = useHoverValue(endText, {
    format: _format,
  })

  const [mergedOpen, triggerInnerOpen] = useMergedState(false, {
    value: open,
    defaultValue: defaultOpen,
    postState: (postOpen) => (mergedDisabled[mergedActivePickerIndex] ? false : postOpen),
    onChange: (newOpen) => {
      if (onOpenChange) {
        onOpenChange(newOpen)
      }
    },
  })

  const startOpen = mergedOpen && mergedActivePickerIndex === 0
  const endOpen = mergedOpen && mergedActivePickerIndex === 1

  const [mergedModes, setInnerModes] = useMergedState<[PanelMode, PanelMode]>([picker, picker], {
    value: mode,
  })

  useEffect(() => {
    setInnerModes([picker, picker])
  }, [picker])

  // const triggerModesChange = (modes: [PanelMode, PanelMode], values: RangeValue) => {
  //   setInnerModes(modes)

  //   if (onPanelChange) {
  //     onPanelChange(values, modes)
  //   }
  // }

  // ========================= Disable Date ==========================
  const [disabledStartDate, disabledEndDate] = useRangeDisabled(
    {
      picker,
      selectedValue,
      disabled: mergedDisabled,
      disabledDate,
    },
    openRecordsRef.current[1],
    openRecordsRef.current[0],
  )

  // const onResetText = () => {
  //   resetEndText()
  //   resetStartText()
  // }

  const triggerRef = React.useRef<any>()
  const triggerOpen = (newOpen: boolean, index: 0 | 1) => {
    if (newOpen) {
      clearTimeout(triggerRef.current)
      openRecordsRef.current[index] = true

      setMergedActivePickerIndex(index)
      triggerInnerOpen(newOpen)

      // Open to reset view date
      if (!mergedOpen) {
        setViewDate(null, index)
      }
    } else if (mergedActivePickerIndex === index) {
      triggerInnerOpen(newOpen)
      const openRecords = openRecordsRef.current
      triggerRef.current = setTimeout(() => {
        if (openRecords === openRecordsRef.current) {
          openRecordsRef.current = {}
        }
      })
    }
  }

  const triggerOpenAndFocus = (index: 0 | 1) => {
    triggerOpen(true, index)
    // Use setTimeout to make sure panel DOM exists
    setTimeout(() => {
      const inputRef = [startInputRef, endInputRef][index]
      if (inputRef.current) {
        inputRef.current.focus()
      }
    }, 0)
  }

  const triggerChange = (newValue: RangeValue, sourceIndex: 0 | 1) => {
    let values = newValue
    let startValue = getValue(values, 0)
    let endValue = getValue(values, 1)
    // >>>>> Format start & end values
    if (startValue && endValue && isAfter(startValue, endValue)) {
      if (
        // WeekPicker only compare week
        (picker === 'week' && !isSameWeek(startValue, endValue)) ||
        // QuotaPicker only compare week
        (picker === 'quarter' && !isSameQuarter(startValue, endValue)) ||
        // Other non-TimePicker compare date
        (picker !== 'week' && picker !== 'quarter' && picker !== 'time' && !isSameDay(startValue, endValue))
      ) {
        // Clean up end date when start date is after end date
        if (sourceIndex === 0) {
          values = [startValue, null]
          endValue = null
        } else {
          startValue = null
          values = [null, endValue]
        }

        // Clean up cache since invalidate
        openRecordsRef.current = {
          [sourceIndex]: true,
        }
      } else if (picker === 'time' && order === true) {
        // Reorder when in same date
        values = reorderValues(values)
      }
    }

    setSelectedValue(values)
    const startStr = values && values[0] ? formatDate(values[0], _format) : ''
    const endStr = values && values[1] ? formatDate(values[1], _format) : ''

    // 外部回调
    if (onCalendarChange) {
      const info: RangeInfo = { range: sourceIndex === 0 ? 'start' : 'end' }

      onCalendarChange(values, [startStr, endStr], info)
    }

    const canStartValueTrigger = canValueTrigger(startValue, 0, mergedDisabled, allowEmpty)
    const canEndValueTrigger = canValueTrigger(endValue, 1, mergedDisabled, allowEmpty)

    const canTrigger = values === null || (canStartValueTrigger && canEndValueTrigger)

    if (canTrigger) {
      // Trigger onChange only when value is validate
      setInnerValue(values)
      if (
        onChange &&
        (!isEqual(getValue(selectedValue, 0)!, startValue) || !isEqual(getValue(selectedValue, 1)!, endValue))
      ) {
        onChange(values, [startStr, endStr])
      }
    }

    // >>>>> Open picker when

    // Always open another picker if possible
    let nextOpenIndex: 0 | 1 | null = null
    if (sourceIndex === 0 && !mergedDisabled[1]) {
      nextOpenIndex = 1
    } else if (sourceIndex === 1 && !mergedDisabled[0]) {
      nextOpenIndex = 0
    }

    if (
      nextOpenIndex !== null &&
      nextOpenIndex !== mergedActivePickerIndex &&
      (!openRecordsRef.current[nextOpenIndex] || !getValue(values, nextOpenIndex)) &&
      getValue(values, sourceIndex)
    ) {
      // Delay to focus to avoid input blur trigger expired selectedValues
      triggerOpenAndFocus(nextOpenIndex)
    } else {
      triggerOpen(false, sourceIndex)
    }
  }

  useOnClickOutside([popperRef, inputDivRef], () => {
    setViewDate(null, 0)
    setViewDate(null, 1)
    setHoverRangedValue([null, null])
  })

  const onSelect = (date: DateType, type: 'key' | 'mouse' | 'submit') => {
    const values = updateValues(selectedValue, date, mergedActivePickerIndex)

    if (type === 'submit' || (type !== 'key' && !needConfirmButton)) {
      // triggerChange will also update selected values
      triggerChange(values, mergedActivePickerIndex)
      // clear hover value style
      if (mergedActivePickerIndex === 0) {
        onStartLeave()
      } else {
        onEndLeave()
      }
    } else {
      setSelectedValue(values)
    }
  }

  const onDateMouseEnter = (date: DateType) => {
    setHoverRangedValue(updateValues(selectedValue, date, mergedActivePickerIndex))
    if (mergedActivePickerIndex === 0) {
      onStartEnter(date)
    } else {
      onEndEnter(date)
    }
  }

  const onDateMouseLeave = () => {
    if (mergedActivePickerIndex === 0) {
      onStartLeave()
    } else {
      onEndLeave()
    }
    setHoverRangedValue([null, null])
  }

  const startStr = dateValue && dateValue[0] ? formatDate(dateValue[0], 'YYYYMMDDHHmmss') : ''
  const endStr = dateValue && dateValue[1] ? formatDate(dateValue[1], 'YYYYMMDDHHmmss') : ''

  useEffect(() => {
    if (!mergedOpen) {
      setSelectedValue(dateValue)

      if (!startValueTexts.length || startValueTexts[0] === '') {
        triggerStartTextChange('')
      }
      if (!endValueTexts.length || endValueTexts[0] === '') {
        triggerEndTextChange('')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mergedOpen, startValueTexts, endValueTexts])

  // Sync innerValue with control mode
  useEffect(() => {
    setSelectedValue(dateValue)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startStr, endStr])

  const renderPanel = () => {
    const panelProps = {
      ...datePickerProps,
      mergedActivePickerIndex,
      disabledDate: mergedActivePickerIndex === 0 ? disabledStartDate : disabledEndDate,
    }
    return <Panel {...panelProps} />
  }

  const extraNode = getExtraFooter(datePickerPrefixCls, mergedModes[mergedActivePickerIndex], renderExtraFooter)

  const rangesNode = getRanges({
    prefixCls: datePickerPrefixCls,
    components,
    needConfirmButton,
    okDisabled:
      !getValue(selectedValue, mergedActivePickerIndex) ||
      !!(
        selectedValue &&
        selectedValue[mergedActivePickerIndex] &&
        disabledDate &&
        disabledDate(selectedValue![mergedActivePickerIndex]!)
      ),
    locale: datePickerLang,
    // rangeList,
    onOk: () => {
      if (getValue(selectedValue, mergedActivePickerIndex)) {
        // triggerChangeOld(selectedValue);
        triggerChange(selectedValue, mergedActivePickerIndex)
        if (onOk) {
          onOk(selectedValue)
        }
      }
    },
  })

  // 渲染日期选择表盘
  const renderPanels = () => {
    let panels: React.ReactNode
    const viewDate = getViewDate(mergedActivePickerIndex)
    if (picker !== 'time' && !showTime) {
      const nextViewDate = getClosingViewDate(viewDate, picker, 1, yearItemNumber)
      const leftPanel = (
        <Context.Provider
          value={{
            hoverRangedValue,
            panelPosition: 'left',
            prefixCls: datePickerPrefixCls,
            rangeValue: selectedValue,
            viewDate: viewDate,
            locale: datePickerLang,
            open: mergedOpen,
            onSelect,
            setViewDate,
            onDateMouseEnter: onDateMouseEnter,
            onDateMouseLeave: onDateMouseLeave,
          }}
        >
          {renderPanel()}
        </Context.Provider>
      )
      const rightPanel = (
        <Context.Provider
          value={{
            hoverRangedValue,
            panelPosition: 'right',
            prefixCls: datePickerPrefixCls,
            rangeValue: selectedValue,
            viewDate: nextViewDate,
            locale: datePickerLang,
            open: mergedOpen,
            onSelect,
            setViewDate,
            onDateMouseEnter: onDateMouseEnter,
            onDateMouseLeave: onDateMouseLeave,
          }}
        >
          {renderPanel()}
        </Context.Provider>
      )
      panels = (
        <div className={classNames(`${datePickerPrefixCls}-container-date`)}>
          {leftPanel}
          {rightPanel}
        </div>
      )
    } else {
      panels = (
        <Context.Provider
          value={{
            hours,
            minutes,
            seconds,
            originHour,
            minute,
            second,
            disabledTimePanel,
            prefixCls: datePickerPrefixCls,
            dateValue: selectedValue ? selectedValue[mergedActivePickerIndex] : null,
            viewDate: viewDate,
            locale: datePickerLang,
            open: mergedOpen,
            onSelect,
            setViewDate,
            onDateMouseEnter: onDateMouseEnter,
            onDateMouseLeave: onDateMouseLeave,
          }}
        >
          <Panel
            {...datePickerProps}
            disabledDate={mergedActivePickerIndex === 0 ? disabledStartDate : disabledEndDate}
          />
        </Context.Provider>
      )
    }
    return panels
  }

  // 箭头偏移(不展示箭头也需要计算)
  let arrowLeft = 0
  if (mergedActivePickerIndex && startInputDivRef.current && separatorRef.current) {
    // Arrow offset
    arrowLeft = startInputDivRef.current.offsetWidth + separatorRef.current.offsetWidth - 10
  }

  // input active Bar 宽度 偏移
  let activeBarLeft = -10
  let activeBarWidth = 0

  if (startInputDivRef.current && endInputDivRef.current && separatorRef.current) {
    if (mergedActivePickerIndex === 0) {
      activeBarWidth = startInputDivRef.current.offsetWidth
    } else {
      activeBarLeft = arrowLeft
      activeBarWidth = endInputDivRef.current.offsetWidth
    }
  }
  const activeBarPositionStyle = { left: activeBarLeft }

  const inputProps: InputRangeProps = {
    startInputRef,
    endInputRef,
    startInputDivRef,
    endInputDivRef,
    separatorRef,
    panelDivRef,

    activeBarWidth,
    activeBarPositionStyle,
    allowClear,
    picker,
    borderType,
    className,
    style,
    size,
    placeholder,
    startText,
    endText,
    dateValue,
    selectedValue,
    startHoverValue,
    endHoverValue,
    mergedDisabled,
    mergedActivePickerIndex,
    separator,
    startOpen,
    endOpen,
    needConfirmButton,
    suffixIcon,
    format: _format,
    open: mergedOpen,
    readOnly: inputReadOnly,
    prefixCls: datePickerPrefixCls,
    locale: datePickerLang,
    dataOrAriaProps: getDataOrAriaProps(datePickerProps),

    resetStartText,
    resetEndText,
    triggerStartTextChange,
    triggerEndTextChange,
    triggerOpen,
    setSelectedValue,
    setMergedActivePickerIndex,
    setHoverRangedValue,
    triggerOpenAndFocus,
    triggerChange,
    onFocus,
    onBlur,
  }

  const renderConfig = () => {
    if (ranges) {
      const rangeArray: RangeArray = []
      Object.keys(ranges).forEach((key) => {
        let range = ranges[key]
        if (typeof range === 'function') {
          range = range()
        }
        if (Array.isArray(range) && range.length === 2 && range[0] && range[1]) {
          rangeArray.push({ key, newValue: [new Date(range[0]), new Date(range[1])] })
        }
      })

      if (rangeArray.length) {
        return (
          <div className={classNames(`${datePickerPrefixCls}-ranges`)}>
            {rangeArray.map(({ key, newValue }) => {
              return (
                <div
                  className={classNames(`${datePickerPrefixCls}-ranges-item`)}
                  key={key}
                  onClick={() => {
                    triggerChange(newValue, 1)
                    if (onOk) {
                      onOk(newValue)
                    }
                    triggerInnerOpen(false)
                  }}
                >
                  {key}
                </div>
              )
            })}
          </div>
        )
      }
    }
    return null
  }

  return usePopper(
    <InputDate ref={inputDivRef} {...inputProps} />,
    <div
      ref={popperRef}
      onMouseDown={(e) => {
        e.preventDefault()
      }}
      className={classNames(`${datePickerPrefixCls}-container`)}
    >
      <div>
        {renderPanels()}
        {extraNode || rangesNode ? (
          <div className={`${datePickerPrefixCls}-footer`}>
            {extraNode}
            {rangesNode}
          </div>
        ) : null}
      </div>
      <div>{renderConfig()}</div>
    </div>,
    {
      trigger: 'click',
      prefixCls: `${datePickerPrefixCls}-panel`,
      arrow: false,
      popperClassName: className,
      popperStyle: style,
      visible: mergedOpen,
      placement: 'bottomLeft',
    },
  )
}

export default DatePicker
