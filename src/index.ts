import equals from 'ramda/src/equals';

type Responder = <T>(iterator: Iterator<T>) => IteratorResult<T>;

type ConditionMatcher = (value: any, allValues: any) => boolean;

const logPrefix = '[rsth]: ';
const colorInfo = "\x1b[37m" // white;
const colorWarning = "'\x1b[33m%s\x1b[0m'" // yellow
const colorError = "\x1b[41m" // red

const logInfo = (...messages: string[]) => console.log(colorInfo, logPrefix, ...messages);
const logWarning = (...messages: string[]) => console.log(colorWarning, logPrefix, ...messages);
const logError = (...messages: string[]) => console.log(colorError, logPrefix, ...messages);

export interface Mock {
  _match: ConditionMatcher;
  _execute: (iterator: Iterator<any>) => IteratorResult<any>;
  next: (value?: any) => this;
  throw: (value?: any) => this;
  return: (value?: any) => this;
  respond: (callback: Responder) => this;
  getResponsesRemaining: () => number;
  getResponseCount: () => number;
  hasResponded: () => boolean;
}

type BoundRunUntil = ( 
  iteratorOrGenerator: Iterator<any> | GeneratorFunction, 
  mocks?: Mock[], 
  debug?: boolean
) => any[];

function runUntil(breakCondition: ConditionMatcher): BoundRunUntil;
function runUntil(  
  breakCondition: ConditionMatcher,
  iteratorOrGenerator?: Iterator<any> | GeneratorFunction,
  mocks?: Mock[],
  debug?: boolean): any[]
function runUntil(
  breakCondition: ConditionMatcher,
  iteratorOrGenerator?: Iterator<any> | GeneratorFunction,
  mocks: Mock[] = [],
  debug = false
): BoundRunUntil | any[] {
  if (iteratorOrGenerator === undefined) {
    return runUntil.bind(null, breakCondition);
  }

  mocks = mocks || [];
  const iterator = typeof iteratorOrGenerator === 'function' ? iteratorOrGenerator() : iteratorOrGenerator;
  if (!iterator || typeof iterator.next !== 'function') {
    logError('Requires an iterator or generator to work. Received:', iteratorOrGenerator.toString())
    return [];
  }

  if (debug) {
    logInfo('VVV Starting VVV');
  }

  const exhaustedMocks: number[] = [];
  mocks.forEach((mock, index) => {
    if (mock.getResponsesRemaining() <= 0) {
      exhaustedMocks.push(index);
    }
  })
  let len = exhaustedMocks.length;
  if (len > 0) {
    logWarning(`${len} mock${len === 1 ? '' : 's'} were already used up before the test started`)
    logWarning('This may mean you didn`t define any responders. Use .next, .throw, .return, or .respond to add one')
    logWarning('  when(call(someFunction)).next("some result")');
    logWarning('Alternatively, it may mean you are trying to reuse mocks between tests.')
    logWarning('"when" mocks are one-time use. Either make new mocks for each test, or use "whenever".')
    logWarning('')
    exhaustedMocks.forEach(mockIndex => {
      logWarning(`at index ${mockIndex}: `, mocks[mockIndex].toString()); // TODO: need a toString function that's useful
    })
  }

  const yieldedValues: any[] = [];
  let result = iterator.next();
  while (!result.done) {
    yieldedValues.push(result.value);
    if (breakCondition(result.value, yieldedValues)) {
      if (debug) {
        logInfo('Reached break condition before the saga could return. Stopping iteration.')
      }
      break;
    }

    const matchingMock = mocks.find(m => m._match(result.value, yieldedValues));
    if (matchingMock) {
      result = matchingMock._execute(iterator);
      if (!result) {
        logError('Got no iterator result. If you are implementing a custom .then, make sure to return the result.')
        return yieldedValues;
      }
    } else {
      result = iterator.next();
    }
  }

  const unusedMocks: number[] = [];
  mocks.forEach((mock, index) => {
    if (!mock.hasResponded()) {
      unusedMocks.push(index);
    }
  })
  len = unusedMocks.length;
  if (len > 0) {
    logWarning(`${len} mock${len === 1 ? '' : 's'} never matched any yielded value`)
    logWarning('This may indicate that the saga is not getting fed in the mock values you expect')
    unusedMocks.forEach(mockIndex => {
      logWarning(`at index ${mockIndex}: `, mocks[mockIndex].toString()); // TODO: need a toString function that's useful
    })
  }

  if (debug) {
    logInfo('^^^ Stopping ^^^');
  }

  return yieldedValues;
}

export const runUntilCompletion = runUntil(() => false);

const cutoff = 1000;

export const run = runUntil((_, allValues) => {
  if (allValues.length > cutoff) {
    throw new Error(
`Generator did not terminate after ${cutoff} yields. You may have an infinite loop.
If you need to run longer, use runUntilCompletion to run forever or runUntil to specify custom logic.`
    );
  }
  return true;
});

function createMock(isSingleUse: boolean, valueOrMatcher: any): Mock {
  let matcher: ConditionMatcher;
  if (typeof valueOrMatcher === 'function') {
    matcher = valueOrMatcher;
  } else {
    matcher = equals(valueOrMatcher)
  }

  const responders: Responder[] = [];
  let responseCount = 0;

  const mock: Mock = {
    getResponseCount: () => responseCount,
    getResponsesRemaining: () => {
      if (isSingleUse) {
        return responders.length - responseCount;
      }
      return Infinity;
    },
    hasResponded: () => responseCount > 0,
    _match: (val, allValues) => responders.length > 0 && matcher(val, allValues),
    _execute: (iterator) => {
      responseCount++;
      const responder = responders[0];
      if (isSingleUse) {
        responders.shift();
      }
      return responder(iterator);
    },
    respond: function (callback: Responder) {
      responders.push(callback);
      if (!isSingleUse && responders.length > 1) {
        logWarning('Chaining multiple responses onto a "whenever" mock has no effect. The first response will be used forever.')
        logWarning('');
        logWarning('You can chain multiple responses onto a when, with each response occuring at most once:')
        logWarning('when(call(someFunction))');
        logWarning('  .throw("first time fails")');
        logWarning('  .next("second time succeeds")');
        logWarning('  // third and later, the mock does nothing. The saga resumes with undefined');
        logWarning('');
        logWarning('If you need more control you can use whenever with a custom .respond:');
        logWarning('let count = 0;');
        logWarning('whenever(call(someFunction))');
        logWarning('  .respond(iterator => {');
        logWarning('    count++;');
        logWarning('    if (count === 1) {');
        logWarning('      return iterator.throw("first time fails");');
        logWarning('    }');
        logWarning('    return iterator.next("all other times succeed");');
        logWarning('  })');
      }
      return this;
    },
    next: function (mockValue) {
      return this.respond(iterator => iterator.next(mockValue));
    },
    throw: function (mockValue) {
      return this.respond(iterator => iterator.throw!(mockValue));
    },
    return: function (mockValue) {
      return this.respond(iterator => iterator.return!(mockValue));
    },
  }

  return mock;
}

export const when = (valueOrMatcher: any) => createMock(true, valueOrMatcher);

export const whenever = (valueOrMatcher: any) => createMock(false, valueOrMatcher);