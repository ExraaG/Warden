import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchLogs} tintColor="#f59e0b" />}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>UPDATE JOB AUDIT LOGS</Text>
      </View>

      {logs.length === 0 ? (
        <Card>
          <Text style={styles.emptyText}>No job execution logs recorded yet.</Text>
        </Card>
      ) : (
        logs.map((log) => {
          const isExpanded = expandedId === log.id;
          return (
            <Card key={log.id}>
              <TouchableOpacity onPress={() => setExpandedId(isExpanded ? null : log.id)} activeOpacity={0.8}>
                <View style={styles.logHeader}>
                  <Badge status={log.status as any} />
                  <Text style={styles.timestamp}>{new Date(log.timestamp).toLocaleTimeString()}</Text>
                </View>

                <Text style={styles.serverName}>{log.serverName}</Text>
                <Text style={styles.summary}>{log.summary}</Text>
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.stepsContainer}>
                  <Text style={styles.stepsTitle}>STEP EXECUTION TIMELINE</Text>
                  {log.steps.map((step, idx) => (
                    <View key={idx} style={styles.stepItem}>
                      <Text style={styles.stepName}>{step.step.toUpperCase()}</Text>
                      <Text style={styles.stepMsg}>{step.message}</Text>
                    </View>
                  ))}
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
  content: { padding: 16 },
  header: { marginBottom: 12 },
  headerTitle: { fontFamily: 'monospace', fontSize: 16, fontWeight: '900', color: '#f8fafc' },
  emptyText: { fontFamily: 'monospace', fontSize: 12, color: '#64748b', textAlign: 'center', paddingVertical: 12 },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  timestamp: { fontFamily: 'monospace', fontSize: 10, color: '#64748b' },
  serverName: { fontFamily: 'monospace', fontSize: 14, fontWeight: 'bold', color: '#f8fafc' },
  summary: { fontFamily: 'monospace', fontSize: 11, color: '#94a3b8', marginTop: 2 },
  stepsContainer: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#1e293b' },
  stepsTitle: { fontFamily: 'monospace', fontSize: 10, fontWeight: 'bold', color: '#f59e0b', marginBottom: 6 },
  stepItem: { marginBottom: 6 },
  stepName: { fontFamily: 'monospace', fontSize: 10, fontWeight: 'bold', color: '#38bdf8' },
  stepMsg: { fontFamily: 'monospace', fontSize: 10, color: '#cbd5e1', marginTop: 1 },
});
