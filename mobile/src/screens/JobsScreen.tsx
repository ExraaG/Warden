import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { IconHistory, IconChevronRight, IconChevronDown, IconCheckCircle, IconXCircle, IconClock } from '../components/ui/Icons';
import { wardenApi } from '../services/api';
import { JobLog } from '@warden/shared';

export const JobsScreen: React.FC = () => {
  const [logs, setLogs] = useState<JobLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await wardenApi.getJobLogs();
      setLogs(data);
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchLogs} tintColor="#34d399" />}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <IconHistory size={18} color="#34d399" />
          <Text style={styles.headerTitle}>ACTIVITY &amp; UPDATE AUDIT</Text>
        </View>
        <Text style={styles.headerBadge}>{logs.length} RECORDS</Text>
      </View>

      {logs.length === 0 ? (
        <Card>
          <View style={styles.emptyState}>
            <IconClock size={32} color="#64748b" />
            <Text style={styles.emptyTitle}>No Audit Logs Recorded</Text>
            <Text style={styles.emptySub}>Automated 4 AM mod updates and manual update triggers will log executions here.</Text>
          </View>
        </Card>
      ) : (
        logs.map((log) => {
          const isExpanded = expandedId === log.id;
          return (
            <Card
              key={log.id}
              accent={log.status === 'success' ? 'emerald' : log.status === 'failed' ? 'red' : 'none'}
              style={styles.logCard}
            >
              <TouchableOpacity
                onPress={() => setExpandedId(isExpanded ? null : log.id)}
                activeOpacity={0.8}
              >
                <View style={styles.logHeader}>
                  <Badge status={log.status as any} />
                  <Text style={styles.timestamp}>{formatTimestamp(log.timestamp)}</Text>
                </View>

                <View style={styles.titleRow}>
                  <Text style={styles.serverName}>{log.serverName}</Text>
                  {isExpanded ? (
                    <IconChevronDown size={18} color="#94a3b8" />
                  ) : (
                    <IconChevronRight size={18} color="#64748b" />
                  )}
                </View>

                <Text style={styles.summary} numberOfLines={isExpanded ? undefined : 2}>
                  {log.summary}
                </Text>
              </TouchableOpacity>

              {isExpanded && log.steps && log.steps.length > 0 && (
                <View style={styles.stepsContainer}>
                  <Text style={styles.stepsTitle}>STEP EXECUTION TIMELINE</Text>
                  {log.steps.map((step, idx) => {
                    const isStepError = step.message.toLowerCase().includes('error') || step.message.toLowerCase().includes('fail');
                    return (
                      <View key={idx} style={styles.stepItem}>
                        <View style={styles.stepIndicatorCol}>
                          {isStepError ? (
                            <IconXCircle size={14} color="#ef4444" />
                          ) : (
                            <IconCheckCircle size={14} color="#34d399" />
                          )}
                          {idx < log.steps.length - 1 && <View style={styles.stepLine} />}
                        </View>
                        <View style={styles.stepContent}>
                          <Text style={styles.stepName}>{step.step.toUpperCase()}</Text>
                          <Text style={styles.stepMsg}>{step.message}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </Card>
          );
        })
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090d16' },
  content: { padding: 16, paddingBottom: 28 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: '900',
    color: '#f8fafc',
    letterSpacing: 1,
  },
  headerBadge: {
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: 'bold',
    color: '#34d399',
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  logCard: {
    marginBottom: 10,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  timestamp: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: '#64748b',
    fontWeight: 'bold',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  serverName: {
    fontFamily: 'monospace',
    fontSize: 15,
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  summary: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#94a3b8',
    lineHeight: 16,
  },
  stepsContainer: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  stepsTitle: {
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: 'bold',
    color: '#34d399',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  stepItem: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  stepIndicatorCol: {
    alignItems: 'center',
    width: 20,
    marginRight: 8,
  },
  stepLine: {
    width: 1,
    flex: 1,
    backgroundColor: '#1e293b',
    marginVertical: 4,
  },
  stepContent: {
    flex: 1,
    paddingBottom: 4,
  },
  stepName: {
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: 'bold',
    color: '#38bdf8',
  },
  stepMsg: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: '#cbd5e1',
    marginTop: 2,
    lineHeight: 14,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 6,
  },
  emptyTitle: {
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: 'bold',
    color: '#f8fafc',
    marginTop: 6,
  },
  emptySub: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 16,
  },
});
